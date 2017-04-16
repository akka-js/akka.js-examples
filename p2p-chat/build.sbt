
name := "akka.js_demo"

scalaVersion in ThisBuild := "2.11.8"
scalacOptions in ThisBuild := Seq("-feature", "-language:_", "-deprecation")

lazy val root = project.in(file(".")).
  aggregate(demoJS, demoJVM)

lazy val demo = crossProject.in(file(".")).
  settings(
    name := "demo",
    fork in run := true
  ).
  jsSettings(
    resolvers += Resolver.sonatypeRepo("releases"),
    libraryDependencies ++= Seq(
      "org.akka-js" %%% "akkajsactor" % "1.2.5.0-SNAPSHOT",
      "org.scala-js" %%% "scalajs-dom" % "0.9.0",
      "com.lihaoyi" %%% "scalatags" % "0.5.4",
      "com.lihaoyi" %%% "upickle" % "0.4.0",
      "eu.unicredit" %%% "paths-scala-js" % "0.4.4"
    ),
    jsDependencies += "org.webjars.bower" % "webrtc-adapter" % "0.2.9" / "adapter.js",
    persistLauncher in Compile := true,
    scalaJSStage in Global := FastOptStage,
    scalaJSUseRhino in Global := false
  )

lazy val demoJVM = demo.jvm
lazy val demoJS = demo.js

cancelable in Global := true
