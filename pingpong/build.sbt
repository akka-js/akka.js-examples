
name := "akka.js_demo"

scalaVersion in ThisBuild := "2.11.8"
scalacOptions in ThisBuild := Seq("-feature", "-language:_", "-deprecation")

lazy val root = project.in(file(".")).
  aggregate(demoJS, demoJVM)

lazy val demo = crossProject.in(file(".")).
  settings(
    name := "pingpong",
    fork in run := true
  ).
  jvmSettings(
    libraryDependencies ++= Seq(
      "com.typesafe.akka" %% "akka-actor" % "2.5.0-RC1"
    )
  ).
  jsSettings(
    libraryDependencies ++= Seq(
      "org.akka-js" %%% "akkajsactor" % "0.2.5.0-RC1-SNAPSHOT"
    ),
    persistLauncher in Compile := true,
    scalaJSStage in Global := FastOptStage
  )

lazy val demoJVM = demo.jvm
lazy val demoJS = demo.js

cancelable in Global := true
