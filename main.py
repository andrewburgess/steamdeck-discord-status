import asyncio
import json
import os
import socket
import struct
import uuid

import decky
from settings import SettingsManager

CLIENT_ID = "1055680235682672682"

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

OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2
OP_PING = 3
OP_PONG = 4

class EmptyReceiveException(Exception):
    """Raised when the socket was expected data but did not receive any"""

class HandshakeException(Exception):
    """Raised when the handshake fails"""

class Pipe:
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
        decky.logger.info("Initializing pipe")
        self.app_id = app_id
        self.socket = socket.socket(socket.AF_UNIX)
        self.connected = True

        file_path = Pipe.get_ipc_file()
        if file_path is None:
            self.connected = False
        else:
            self.socket.connect(file_path)
            decky.logger.debug("Connected to %s", file_path)

    def disconnect(self):
        decky.logger.info("Disconnecting")
        self._send({}, OP_CLOSE)

        self.socket.shutdown(socket.SHUT_RDWR)
        self.socket.close()
        self.socket = None
        self.connected = False

    def handshake(self):
        decky.logger.info("Beginning handshake for app %s", self.app_id)
        self._send({'v': 1, 'client_id': self.app_id}, op=OP_HANDSHAKE)
        data = self._recv()

        try:
            if data['cmd'] == 'DISPATCH' and data['evt'] == 'READY':
                decky.logger.info("Connected")
                return True
            
            else:
                decky.logger.error("Handshake failed %s", data)
                raise HandshakeException()

        except KeyError:
            if data['code'] == 4000:
                decky.logger.error("Handshake failed %s", data)
                raise HandshakeException()

    def _recv(self):
        recv_data = self.socket.recv(1024)
        enc_header = recv_data[:8]
        dec_header = struct.unpack("<ii", enc_header)
        enc_data = recv_data[8:]

        output = json.loads(enc_data.decode('UTF-8'))
        
        decky.logger.info(output)
        return output
    
    def _send(self, payload, op=OP_FRAME):
        decky.logger.info(payload)

        payload = json.dumps(payload).encode('UTF-8')
        payload = struct.pack('<ii', op, len(payload)) + payload

        self.socket.send(payload)

class Plugin:
    async def debug(self, args):
        decky.logger.debug("Called with %s ", args)

    def _get_settings(self):
        # Created on demand rather than in _main, so a frontend call that lands
        # before the startup task has run still works.
        if getattr(self, "settings", None) is None:
            self.settings = SettingsManager(
                name="settings",
                settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR
            )
            self.settings.read()

        return self.settings

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

    async def clear_activity(self):
        if self.pipe is None:
            return False
        
        decky.logger.info("Clearing activity")

        data = {
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": os.getpid()
            },
            "nonce": str(uuid.uuid4())
        }

        self.pipe._send(data)
        self.pipe.disconnect()
        self.pipe = None

        return True

    async def update_activity(self, activity):
        #if self.pipe:
        #    decky_plugin.logger.info("Clearing old pipe")
        #    self.pipe.disconnect()
        #    self.pipe = None

        try:
            data = {
                "cmd": "SET_ACTIVITY",
                "args": {
                    "pid": os.getpid(),
                    "activity": {
                        "state": "on {}".format(self._read_device_name()),
                        "assets": {
                            "large_image": activity["imageUrl"],
                            "small_image": "https://cdn.discordapp.com/app-assets/1055680235682672682/1056080943783354388.png"
                        },
                        "timestamps": {
                            "start": activity["startTime"]
                        }
                    },
                },
                "nonce": str(uuid.uuid4())
            }

            discord_id = self._read_discord_application_id()

            if "discordId" in activity:
                discord_id = activity["discordId"]
            else:
                data["args"]["activity"]["details"] = "Playing {}".format(activity["details"]["name"])

            decky.logger.info("Updating activity: %s (%s)", activity["details"]["name"], discord_id)
            self.pipe = Pipe(discord_id)

            if self.pipe.connected:
                self.pipe.handshake()
                self.pipe._send(data)
                return True
            else:
                return False
        except Exception as e:
            decky.logger.error(e)
            return False
        
    def check_connection(self):
        pipe_file = Pipe.get_ipc_file()

        return pipe_file is not None

    async def is_connected(self):
        decky.logger.info("Checking connection status")
        connected = False
        tries = 0

        while not connected and tries < 2:
            connected = self.check_connection()
            tries += 1
            
            if not connected:
                decky.logger.warning("No IPC file, retrying in 5 seconds")
                await asyncio.sleep(1)
            else:
                decky.logger.info("Found IPC file")

        return connected
        
    async def disconnect(self):
        if self.pipe is not None and self.pipe.connected:
            decky.logger.info("Closing connection")
            self.pipe.disconnect()
            self.pipe = None

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        decky.logger.info("Starting Discord status plugin")

        await self.is_connected()

    
    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        self.disconnect()
