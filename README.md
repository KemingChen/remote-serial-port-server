## Introduction

Serial port over ethernet using a HTTP server with REST API.
## Getting Started

Install the package:
```bash
git clone https://github.com/KemingChen/remote-serial-port-server.git
cd remote-serial-port-server
npm install
```

Start the server:
```bash
node .
```

## Features

* list and control serial ports remotely
* REST API
* shared serial port (connect multiple clients to a single serial port)

## REST API

See [REST API Documentation](API.md)

## Usage Scenarios

1. Accessing a serial port via internet, lets say port 80 and web interface. Could be set up with a secure connection using SSL for both HTTP and WebSocket using a proxy, e.g. nginx or Apache.
2. Sharing a single serial port with multiple clients. Connected clients can read/write to one serial port. User can also monitor the traffic for development and debugging purposes.
3. Accessing a serial port on virtual machines when there is no hardware attached.
4. Also used for crappy serial port drivers for cheap chinese Arduino clones. This can be done by running a virtual machine and attaching a USB device. Drivers are then installed to the virtual machine instead of host machine.
5. Using a Raspberry Pi as a remote serial port host, e.g. hosting a WS2300 weather station connected to a Raspberry Pi and controlled from a desktop computer.