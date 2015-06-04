# akka.js-calculator
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
$ npm i -g st
$ st --no-cache &; $BROWSER http://localhost:1337/index.html
```
