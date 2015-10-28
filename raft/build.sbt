val commonSettings = Seq(
    //EclipseKeys.useProjectId := true,
    //EclipseKeys.skipParents in ThisBuild := false,
    scalaVersion := "2.11.7",
    organization := "akka.js",
    scalacOptions ++= Seq(
        "-deprecation",
        "-unchecked",
        "-feature",
        "-encoding", "utf8"
    ),
    resolvers += "Typesafe repository" at "http://repo.typesafe.com/typesafe/releases/",
    resolvers += "sonatype-snapshots" at "https://oss.sonatype.org/content/repositories/snapshots",
    scalaJSStage in Global := FastOptStage
)

lazy val root = project.in(file("."))
  .enablePlugins(ScalaJSPlugin)
  .settings(commonSettings: _*)
  .settings(
    name := "raft",
    libraryDependencies += "akka.js" %%% "akkaactor" % "0.2-SNAPSHOT",
    persistLauncher in Compile := true,
    version := "0.2-SNAPSHOT"
  )

