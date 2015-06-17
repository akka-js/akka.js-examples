# akka.js-examples
A port of the Coursera Functional Reactive Programming exercise (Scala.rx -> Akka.js)

## To run

**Calculator**

```
$ cd calculator
$ sbt webUI/fastOptJS
$ $BROWSER web-ui/index.html
```

**Raft**

```
$ cd raft
$ sbt fastOptJS
```
and then start a web server in your preferred way:

i.e.
```
$ python -m SimpleHTTPServer
$ $BROWSER http://localhost:8000/index.html
```
or
```
$ npm i -g st
$ st --no-cache &
$ $BROWSER http://localhost:1337/index.html
```

