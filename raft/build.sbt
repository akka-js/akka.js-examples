
name := "akka.js_demo"

scalaVersion in ThisBuild := "2.12.6"
scalacOptions in ThisBuild := Seq("-feature", "-language:_", "-deprecation")

lazy val root = project.in(file(".")).
  aggregate(demoJS, demoJVM)

lazy val demo = crossProject.in(file(".")).
  settings(
    name := "raft",
    fork in run := true
  ).
  jvmSettings(
    libraryDependencies ++= Seq(
      "com.typesafe.akka" %% "akka-actor" % "2.5.14"
    )
  ).
  jsSettings(
    resolvers += Resolver.sonatypeRepo("releases"),
    libraryDependencies ++= Seq(
      "org.akka-js" %%% "akkajsactor" % "1.2.5.14"
    ),
    scalaJSStage in Global := FastOptStage,
    scalaJSUseMainModuleInitializer := true,
    skip in packageJSDependencies := false
  )

lazy val demoJVM = demo.jvm
lazy val demoJS = demo.js

cancelable in Global := true
