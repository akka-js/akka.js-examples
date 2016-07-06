# akka.js-examples

Here we have a collection of examples on how you can use Akka.JS in the browser.
Each description is followed by the commands to run to get the related example run.

You need of course sbt and node installed.

##Calculator

A port of the Coursera Functional Reactive Programming exercise (Scala.rx -> Akka.js)

```
$ cd calculator
$ sbt webUI/fastOptJS
$ $BROWSER web-ui/index.html
```

##Chat-backend

An implementation of a server that broadcast messages over each connected websocket

JVM
```
$ cd chat-backend
$ sbt demoJVM/run
```

JS
```
$ cd chat-backend
$ npm install websocket
$ sbt demoJS/run
```

##Chat-ui

A generic front end for a broadcast chat.
Insert the url of the server you want to connect and then send your messages over websocket.

```
$ cd chat-ui
$ sbt demoJS/fullOptJS
$ $BROWSER ui/index.html
```

##P2P-Chat

A Point to Point Chat serverless with manual key exchange over WebRTC.
This is very experimental and could not work ...
Please take inspiration from the code.

```
$ cd p2p-chat
$ sbt demoJS/fullOptJS
$ $BROWSER ui/index.html
```

##PingPong

A very basic example that could run on Js or on JVM.
This is a very good starting point to be used as template for new projects.

JVM
```
$ cd pingpong
$ sbt demoJVM/run
```

JS
```
$ cd pingpong
$ sbt demoJS/run
```

##Raft

A basic implementation of the Raft algo taken from: [archie](https://github.com/archie/raft)
As you can see it cross compile.

JVM
```
$ cd raft
$ sbt demoJVM/run
```

JS
```
$ cd raft
$ sbt demoJS/run
```

##Streams

An example usage of akka streams.
This is very bleeding edge but please go on and report any issue you find here!

JVM
```
$ cd streams
$ sbt demoJVM/run
```

JS
```
$ cd streams
$ sbt demoJS/run
```

##ToDo

Here you can check possible integration with UI frameworks.
Running it will show you a basic ToDo WebPage.
This is a good starting point for projects that want to use Actor model to design Web UI.

```
$ cd todo
$ sbt demoJS/fullOptJS
$ $BROWSER ui/index.html
```
