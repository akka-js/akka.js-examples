lazy val webUI = project.in(file("web-ui")).
  enablePlugins(ScalaJSPlugin).
  settings(
    scalaVersion := "2.11.8",
    // Add the sources of the calculator project
    unmanagedSourceDirectories in Compile +=
      (scalaSource in (assignmentProject, Compile)).value / "calculator",
    libraryDependencies += "org.scala-js" %%% "scalajs-dom" % "0.8.0",
    libraryDependencies += "akka.js" %%% "akkaactor" % "0.1.1-SNAPSHOT",
    libraryDependencies += "org.scalatest" %%% "scalatest" % "3.0.0-SNAP5",
    scalaJSStage in Global := FastOptStage,
    persistLauncher in Compile := true
  )
