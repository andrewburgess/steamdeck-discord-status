import asyncio
import json
import os
import select
import socket
import struct
import uuid

import decky
from settings import SettingsManager

CLIENT_ID = "1055680235682672682"

# The plugin's own icon, shown as the small overlay on the presence.
SMALL_IMAGE = "https://cdn.discordapp.com/app-assets/1055680235682672682/1056080943783354388.png"

# SteamOS runs on plenty of hardware that is not a Steam Deck, and there is no
# reliable way to tell those devices apart automatically, so the name is just
# something the user tells us.
DEFAULT_DEVICE_NAME = "Steam Deck"
SETTING_DEVICE_NAME = "device_name"

# Discord takes the bold application name in the presence from whichever
# application the client_id belongs to -- SET_ACTIVITY has no field for it. The
# only way to change that text is to hand over a different application, so the
# id is configurable.
SETTING_DISCORD_APPLICATION_ID = "discord_application_id"

# How often the supervisor re-asserts the presence while something is running,
# and how soon it tries again after a failure. Discord rate limits SET_ACTIVITY
# to roughly five updates per twenty seconds, so both stay well inside that.
SUPERVISOR_INTERVAL = 60
SUPERVISOR_RETRY_INTERVAL = 15

OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2
OP_PING = 3
OP_PONG = 4

class EmptyReceiveException(Exception):
    """Raised when the socket was expected to receive data but did not"""

class HandshakeException(Exception):
    """Raised when the handshake fails"""

class CommandException(Exception):
    """Raised when Discord answers a command with an error"""

class Pipe:
    # Every read and write is bounded so a wedged Discord cannot stall the
    # plugin's event loop indefinitely.
    TIMEOUT = 5

    @staticmethod
    def get_ipc_file():
        flatpak_root = "/run/user/1000/app/com.discordapp.Discord"
        other_root = os.environ.get("XDG_RUNTIME_DIR") or "/run/user/1000"

        for i in range(10):
            path = os.path.join(flatpak_root, "discord-ipc-{}".format(i))
            if os.path.exists(path):
                return path
            path = os.path.join(other_root, "discord-ipc-{}".format(i))
            if os.path.exists(path):
                return path

        return None

    def __init__(self, app_id):
        decky.logger.info("Initializing pipe for app %s", app_id)
        self.app_id = app_id
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.settimeout(Pipe.TIMEOUT)
        self.connected = False

        file_path = Pipe.get_ipc_file()
        if file_path is None:
            decky.logger.info("No Discord IPC socket present")
            self._close_socket()
            return

        try:
            self.socket.connect(file_path)
        except OSError as e:
            # The socket file outlives a crashed Discord, so finding one is not
            # proof that anything is listening on it.
            decky.logger.warning("Could not connect to %s: %s", file_path, e)
            self._close_socket()
            return

        self.connected = True
        decky.logger.debug("Connected to %s", file_path)

    def is_alive(self):
        """Whether Discord is still on the other end.

        ``connected`` only records that the connect succeeded, so it stays true
        for a Discord that has since quit. Its half of the socket reads as end of
        file once it goes, which peeking finds without consuming a real frame.
        """
        if not self.connected or self.socket is None:
            return False

        try:
            # Peeking would block on a live but quiet pipe, so only look once the
            # socket has something -- either a frame or the end of file.
            readable, _, _ = select.select([self.socket], [], [], 0)
            if not readable:
                return True

            return self.socket.recv(1, socket.MSG_PEEK) != b""
        except OSError as e:
            decky.logger.debug("Pipe for app %s is not usable: %r", self.app_id, e)
            return False

    def disconnect(self):
        """Closes the pipe, telling Discord first while that is still possible."""
        if self.socket is None:
            self.connected = False
            return

        decky.logger.info("Disconnecting pipe for app %s", self.app_id)

        if self.connected:
            try:
                self._send({}, OP_CLOSE)
                self.socket.shutdown(socket.SHUT_RDWR)
            except OSError as e:
                decky.logger.debug("Ignoring error while closing pipe: %s", e)

        self._close_socket()
        self.connected = False

    def handshake(self):
        decky.logger.info("Beginning handshake for app %s", self.app_id)
        self._send({'v': 1, 'client_id': self.app_id}, op=OP_HANDSHAKE)
        data = self._recv()

        if data.get("cmd") == "DISPATCH" and data.get("evt") == "READY":
            decky.logger.info("Connected")
            return True

        decky.logger.error("Handshake failed %s", data)
        raise HandshakeException("unexpected handshake response: {}".format(data))

    def send(self, payload):
        """Sends a command and reads the reply, raising when Discord refuses it.

        Leaving the reply unread would let it pile up in the receive buffer and
        would hide every rejection -- a bad application id or a rate limit look
        exactly like success from the sending side.
        """
        self._send(payload)
        response = self._recv()

        if response.get("evt") == "ERROR":
            data = response.get("data") or {}
            raise CommandException("{} ({})".format(
                data.get("message", "unknown error"),
                data.get("code", "?")
            ))

        return response

    def _close_socket(self):
        if self.socket is None:
            return

        try:
            self.socket.close()
        except OSError:
            pass

        self.socket = None

    def _recv_exactly(self, count):
        buffer = b""

        while len(buffer) < count:
            chunk = self.socket.recv(count - len(buffer))
            if not chunk:
                raise EmptyReceiveException(
                    "Discord closed the connection after {} of {} bytes".format(
                        len(buffer), count
                    )
                )

            buffer += chunk

        return buffer

    def _recv(self):
        # Read the length the header advertises rather than a fixed block: the
        # READY payload has outgrown a single 1024 byte read, and a recv can
        # return a partial frame regardless of size.
        header = self._recv_exactly(8)
        _op, length = struct.unpack("<ii", header)
        payload = self._recv_exactly(length) if length > 0 else b"{}"

        output = json.loads(payload.decode('UTF-8'))

        decky.logger.debug("Received %s", output)
        return output

    def _send(self, payload, op=OP_FRAME):
        decky.logger.debug("Sending %s", payload)

        payload = json.dumps(payload).encode('UTF-8')
        payload = struct.pack('<ii', op, len(payload)) + payload

        self.socket.sendall(payload)

class Plugin:
    # Declared on the class so a frontend call that lands before anything has
    # connected reads None rather than raising AttributeError.
    activity = None
    pipe = None
    settings = None
    supervisor = None

    async def debug(self, args):
        decky.logger.debug("Called with %s ", args)

    def _get_settings(self):
        # Created on demand rather than in _main, so a frontend call that lands
        # before the startup task has run still works.
        if self.settings is None:
            self.settings = SettingsManager(
                name="settings",
                settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR
            )
            self.settings.read()

        return self.settings

    def _get_lock(self):
        # Guards the pipe. Created lazily because it has to be built on the
        # running event loop.
        if getattr(self, "lock", None) is None:
            self.lock = asyncio.Lock()

        return self.lock

    def _read_device_name(self):
        name = self._get_settings().getSetting(SETTING_DEVICE_NAME, DEFAULT_DEVICE_NAME)

        if not isinstance(name, str) or not name.strip():
            return DEFAULT_DEVICE_NAME

        return name.strip()

    def _read_discord_application_id(self):
        app_id = self._get_settings().getSetting(SETTING_DISCORD_APPLICATION_ID, CLIENT_ID)

        if not Plugin._is_valid_application_id(app_id):
            return CLIENT_ID

        return app_id.strip()

    @staticmethod
    def _is_valid_application_id(value):
        """Discord application ids are snowflakes: 17 to 20 digits."""
        if not isinstance(value, str):
            return False

        stripped = value.strip()

        return stripped.isdigit() and 17 <= len(stripped) <= 20

    async def get_device_name(self):
        return self._read_device_name()

    async def get_discord_application_id(self):
        return self._read_discord_application_id()

    async def set_discord_application_id(self, app_id):
        """Fallback Discord application ID to use when we can't otherwise match an existing one that would
        have the correct rich presence display."""
        # Only a blank string means "clear this"; anything that is not a string
        # is malformed input and must not wipe a custom application id.
        if not isinstance(app_id, str):
            decky.logger.warning("Rejecting non-string Discord application id %r", app_id)
            return self._read_discord_application_id()

        cleaned = app_id.strip()

        if not cleaned:
            decky.logger.info("Restoring default Discord application id")
            self._get_settings().setSetting(SETTING_DISCORD_APPLICATION_ID, CLIENT_ID)
            return CLIENT_ID

        if not Plugin._is_valid_application_id(cleaned):
            decky.logger.warning("Rejecting invalid Discord application id %s", cleaned)
            return self._read_discord_application_id()

        decky.logger.info("Setting Discord application id to %s", cleaned)
        self._get_settings().setSetting(SETTING_DISCORD_APPLICATION_ID, cleaned)

        return cleaned

    async def set_device_name(self, name):
        """Allows for customizing device name shown in rich presence since not everyone is on a Steam Deck anymore"""
        cleaned = name.strip() if isinstance(name, str) else ""
        if not cleaned:
            cleaned = DEFAULT_DEVICE_NAME

        decky.logger.info("Setting device name to %s", cleaned)
        self._get_settings().setSetting(SETTING_DEVICE_NAME, cleaned)

        return cleaned

    def _app_id_for(self, activity):
        """The Discord application to report as: the one matched for this game,
        or the user's fallback when Discord does not know it."""
        if activity and activity.get("discordId"):
            return activity["discordId"]

        return self._read_discord_application_id()

    def _drop_pipe(self):
        if self.pipe is not None:
            self.pipe.disconnect()
            self.pipe = None

    def _ensure_pipe(self, app_id):
        """A handshaken pipe for app_id, reusing the open one where possible.

        Reconnecting per update meant the previous socket was closed by garbage
        collection right after the replacement had connected, so Discord saw an
        abrupt client disconnect racing every presence change.
        """
        if self.pipe is not None:
            if self.pipe.app_id == app_id and self.pipe.is_alive():
                return self.pipe

            self._drop_pipe()

        pipe = Pipe(app_id)
        if not pipe.connected:
            return None

        pipe.handshake()
        self.pipe = pipe

        return pipe

    def _push_activity(self, activity):
        """Sends the presence, reconnecting once if the open pipe has gone away."""
        app_id = self._app_id_for(activity)

        data = {
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": os.getpid(),
                "activity": {
                    "state": "on {}".format(self._read_device_name()),
                    "assets": {
                        "large_image": activity["imageUrl"],
                        "small_image": SMALL_IMAGE
                    },
                    "timestamps": {
                        "start": activity["startTime"]
                    }
                },
            },
            "nonce": str(uuid.uuid4())
        }

        if not activity.get("discordId"):
            data["args"]["activity"]["details"] = "Playing {}".format(activity["details"]["name"])

        for attempt in range(2):
            try:
                pipe = self._ensure_pipe(app_id)
                if pipe is None:
                    return False

                pipe.send(data)
                return True
            except (CommandException, HandshakeException) as e:
                # Discord answered and refused, so trying again changes nothing.
                decky.logger.error("Discord rejected the activity: %r", e)
                self._drop_pipe()
                return False
            except (OSError, EmptyReceiveException, ValueError) as e:
                # A pipe held open since the last update may have been closed by
                # a Discord restart, and a fresh one usually works.
                decky.logger.warning("Activity update failed (attempt %d): %r", attempt + 1, e)
                self._drop_pipe()

        return False

    async def clear_activity(self):
        async with self._get_lock():
            self.activity = None

            if self.pipe is None or not self.pipe.is_alive():
                self._drop_pipe()
                return False

            decky.logger.info("Clearing activity")

            try:
                self.pipe.send({
                    "cmd": "SET_ACTIVITY",
                    "args": {
                        "pid": os.getpid()
                    },
                    "nonce": str(uuid.uuid4())
                })
            except (CommandException, EmptyReceiveException, OSError, ValueError) as e:
                decky.logger.warning("Could not clear activity: %r", e)
                self._drop_pipe()
                return False

            self._drop_pipe()

            return True

    async def update_activity(self, activity):
        decky.logger.info(
            "Updating activity: %s (%s)",
            activity["details"]["name"],
            self._app_id_for(activity)
        )

        async with self._get_lock():
            # Held so the supervisor can re-assert it without the frontend
            # having to be open.
            self.activity = activity

            return self._push_activity(activity)

    def _probe(self):
        """Opens a connection for real rather than trusting the socket file."""
        if self.pipe is not None:
            if self.pipe.is_alive():
                return True

            # Discord has gone since the pipe was opened, so start over rather
            # than reporting the connection it left behind.
            self._drop_pipe()

        try:
            return self._ensure_pipe(self._app_id_for(self.activity)) is not None
        except (EmptyReceiveException, HandshakeException, OSError, ValueError) as e:
            decky.logger.warning("Discord probe failed: %r", e)
            self._drop_pipe()
            return False

    async def is_connected(self):
        decky.logger.info("Checking connection status")

        async with self._get_lock():
            for attempt in range(2):
                if self._probe():
                    decky.logger.info("Connected to Discord")
                    return True

                if attempt == 0:
                    decky.logger.warning("No Discord connection, retrying in 1 second")
                    await asyncio.sleep(1)

        return False

    async def disconnect(self):
        async with self._get_lock():
            # An explicit disconnect also stops the supervisor re-asserting.
            self.activity = None
            self._drop_pipe()

    async def _supervise(self):
        """Re-asserts the presence periodically while something is running.

        Nothing else recovers a presence that has gone stale: a Discord restart,
        a resume from suspend or a dropped socket would otherwise leave it wrong
        until the user happened to open the plugin's panel, which reconnects as
        a side effect and hides the problem.
        """
        delay = SUPERVISOR_INTERVAL

        while True:
            await asyncio.sleep(delay)
            delay = SUPERVISOR_INTERVAL

            try:
                async with self._get_lock():
                    if self.activity is None:
                        continue

                    if not self._push_activity(self.activity):
                        decky.logger.warning("Supervisor could not refresh the activity")
                        delay = SUPERVISOR_RETRY_INTERVAL
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # The loop has to outlive anything a single pass can throw.
                decky.logger.error("Supervisor pass failed: %r", e)
                delay = SUPERVISOR_RETRY_INTERVAL

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        decky.logger.info("Starting Discord status plugin")

        await self.is_connected()

        self.supervisor = asyncio.create_task(self._supervise())


    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        decky.logger.info("Unloading Discord status plugin")

        if self.supervisor is not None:
            supervisor = self.supervisor
            self.supervisor = None

            # Cancelling only asks; the task has to be awaited or it is still
            # pending when the loop tears down and asyncio complains.
            supervisor.cancel()
            try:
                await supervisor
            except asyncio.CancelledError:
                pass

        await self.disconnect()
