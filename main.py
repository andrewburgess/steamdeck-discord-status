import asyncio
import json
import logging
import os
import socket
import struct
import uuid

CLIENT_ID = "1055680235682672682"

logging.basicConfig(filename="/tmp/discord-status.log",
                    format="[DiscordStatus] %(asctime)s %(levelname)s %(message)s",
                    filemode="w+",
                    force=True)
logger=logging.getLogger()
logger.setLevel(logging.INFO) # can be changed to logging.DEBUG for debugging issues

OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2
OP_PING = 3
OP_PONG = 4

connecting = False
connected = False
client = None

class EmptyReceiveException(Exception):
    """Raised when the socket was expected data but did not receive any"""

class Plugin:
    async def debug(self, args):
        logger.debug("Called with %s ", args)

    async def clear_activity(self):
        global connected
        
        logger.info("Clearing activity")

        if not connected:
            await self.connect(self)

        data = {
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": os.getpid()
            },
            "nonce": str(uuid.uuid4())
        }

        op, result = Plugin.send_recv(data)
        logger.debug("result %s", result)

        return True

    async def update_activity(self, activity):
        global connected

        logger.info("Updating activity: %s", activity["details"]["name"])
        if not connected:
            logger.debug("Not connected, attempting to reconnect")
            await self.connect(self)

        data = {
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": os.getpid(),
                "activity": {
                    "state": "on Steam Deck",
                    "details": "Playing {}".format(activity["details"]["name"]),
                    "assets": {
                        "large_image": activity["imageUrl"],
                        "small_image": "steamdeck-icon"
                    },
                    "timestamps": {
                        "start": activity["startTime"]
                    }
                }
            },
            "nonce": str(uuid.uuid4())
        }

        op, result = Plugin.send_recv(data)
        logger.debug("result %s", result)

        return True

    async def reconnect(self):
        global connecting
        global connected

        if connected:
            Plugin.send({}, op=OP_PING)

            if connected:
                logger.debug("Already connected")
                return True
        
        if connecting:
            pass

        logger.info("Attempting to reconnect")
        await self.connect(self)

        return connected

    # Asyncio-compatible long-running code, executed in a task when the plugin is loaded
    async def _main(self):
        global connecting
        global connected
        global client

        logger.info("Starting Discord status plugin")
        connected = False
        connecting = False

        await self.connect(self)
    
    # Function called first during the unload process, utilize this to handle your plugin being removed
    async def _unload(self):
        global connecting
        connecting = False
        if connected:
            logger.info("Closing connection")
            self.close(self)
        else:
            logger.info("Wasn't connected")

    async def connect(self):
        global client
        global connected
        global connecting

        connecting = True
        tries = 0
        
        while not connected and tries < 5 and connecting:
            tries = tries + 1
            socketPath = self._get_socket_path(self)
            if socketPath == None:
                logger.debug("Socket file does not exist")
                await asyncio.sleep(2)
                continue
            else:
                logger.info("Socket file found at {}".format(socketPath))

            client = socket.socket(socket.AF_UNIX)
            logger.debug("Attempting to connect to socket")
            try:
                client.connect(socketPath)
                await self._handshake(self)
            except EmptyReceiveException:
                if (client):
                    client.close()
                client = None
                connected = False
                await asyncio.sleep(5)
            except ConnectionResetError:
                if (client):
                    client.close()
                client = None
                connected = False
                await asyncio.sleep(5)
            except OSError as e:
                logger.error("Socket not available: {}".format(e))
                if (client):
                    client.close()
                await asyncio.sleep(5)
            except BaseException as e:
                logger.error("Some other error occurred: {}".format(e))
        connecting = False

    def close(self):
        global connected
        global connecting
        global client

        connecting = False

        try:
            if (client):
                client.close()
        except BrokenPipeError as e:
            client = None
            logger.warn("Pipe is broken, client closed unexpectedly")

        connected = False
        logger.info("Socket closed")

    def _get_socket_path(self):
        flatPakRoot = "/run/user/1000/app/com.discordapp.Discord"
        otherRoot = os.environ.get("XDG_RUNTIME_DIR") or "/run/user/1000"

        for i in range(10):
            path = os.path.join(flatPakRoot, "discord-ipc-{}".format(i))
            if os.path.exists(path):
                return path
            path = os.path.join(otherRoot, "discord-ipc-{}".format(i))
            if os.path.exists(path):
                return path
        
        return None

    async def _handshake(self):
        global connected

        if client is None:
            return self.connect(self)

        ret_op, ret_data = Plugin.send_recv({"v": 1, "client_id": CLIENT_ID}, op=OP_HANDSHAKE)
        if ret_op == OP_FRAME and ret_data["cmd"] == "DISPATCH" and ret_data["evt"] == "READY":
            connected = True
            logger.info("Connected")

            return
        else:
            logger.error("Handshake failed %s", ret_data)


    def _recv_exactly(size) -> bytes:
        buf = b""
        size_remaining = size
        tries = 0
        while size_remaining and tries < 10:
            chunk = Plugin._recv(size_remaining)
            buf += chunk
            if len(chunk) == 0:
                logger.debug("empty receive")
                tries = tries + 1
            size_remaining -= len(chunk)

        if size_remaining > 0:
            raise EmptyReceiveException()

        return buf

    def _recv_header():
        header = Plugin._recv_exactly(8)
        return struct.unpack("<II", header)

    def send_recv(data, op=OP_FRAME):
        Plugin.send(data, op)
        return Plugin.recv()

    def send(data, op=OP_FRAME):
        logger.debug("sending %s", data)
        data_str = json.dumps(data, separators=(",", ":"))
        data_bytes = data_str.encode("utf-8")
        header = struct.pack("<II", op, len(data_bytes))
        Plugin._write(header)
        Plugin._write(data_bytes)

    def recv():
        op, length = Plugin._recv_header()
        payload = Plugin._recv_exactly(length)
        data = json.loads(payload.decode("utf-8"))
        logger.debug("received %s", data)
        return op, data

    def _write(data: bytes):
        global client
        global connected

        try:
            if client:
                client.sendall(data)
            else:
                connected = False
        except BrokenPipeError as e:
            logger.warn("Write failed, pipe is broken")
            client = None
            connected = False
            
    def _recv(size: int) -> bytes:
        global client
        global connected

        try:
            if client:
                return client.recv(size)
            else:
                connected = False
        except BrokenPipeError as e:
            logger.warn("Receive failed, pipe is broken")
            client = None
            connected = False
