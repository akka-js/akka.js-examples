lazy val webUI = project.in(file("web-ui")).
  enablePlugins(ScalaJSPlugin).
  settings(
    scalaVersion := "2.11.8",
    resolvers += Resolver.sonatypeRepo("releases"),
    // Add the sources of the calculator project
    unmanagedSourceDirectories in Compile +=
      (scalaSource in (assignmentProject, Compile)).value / "calculator",
    libraryDependencies += "org.scala-js" %%% "scalajs-dom" % "0.9.0",
    libraryDependencies += "org.akka-js" %%% "akkajsactor" % "1.2.5.0",
    libraryDependencies += "org.scalatest" %%% "scalatest" % "3.0.0",
    scalaJSStage in Global := FastOptStage,
    persistLauncher in Compile := true
  )
