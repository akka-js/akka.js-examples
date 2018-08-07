lazy val webUI = project.in(file("web-ui")).
  enablePlugins(ScalaJSPlugin).
  settings(
    scalaVersion := "2.12.6",
    resolvers += Resolver.sonatypeRepo("releases"),
    // Add the sources of the calculator project
    unmanagedSourceDirectories in Compile +=
      baseDirectory.value / ".." / "src" / "main" / "scala",
    libraryDependencies += "org.scala-js" %%% "scalajs-dom" % "0.9.2",
    libraryDependencies += "org.akka-js" %%% "akkajsactor" % "1.2.5.14",
    scalaJSStage in Global := FastOptStage,
    scalaJSUseMainModuleInitializer := true,
    skip in packageJSDependencies := false
  )
