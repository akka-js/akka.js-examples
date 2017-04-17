
name := "akka.js_demo"

scalaVersion in ThisBuild := "2.12.1"
scalacOptions in ThisBuild := Seq("-feature", "-language:_", "-deprecation")

lazy val root = project.in(file(".")).
  aggregate(demoJS, demoJVM)

lazy val demo = crossProject.in(file(".")).
  settings(
    name := "demo",
    fork in run := true
  ).
  jvmSettings(
    resolvers += "Akka Snapshots" at " http://repo.akka.io/snapshots/",
    libraryDependencies ++= Seq(
      "com.typesafe.akka" %% "akka-actor" % "2.5.0",
      "com.typesafe.akka" %% "akka-stream" % "2.5.0"
    )
  ).
  jsSettings(
    resolvers += Resolver.sonatypeRepo("releases"),
    libraryDependencies ++= Seq(
      "org.akka-js" %%% "akkajsactorstream" % "1.2.5.0",
      "org.akka-js" %%% "akkajsactor" % "1.2.5.0",
      "com.lihaoyi" %%% "scalatags" % "0.6.3"
    ),
    persistLauncher in Compile := true,
    scalaJSStage in Global := FastOptStage
  )

lazy val demoJVM = demo.jvm
lazy val demoJS = demo.js

cancelable in Global := true
