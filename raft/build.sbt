val commonSettings = Seq(
    EclipseKeys.useProjectId := true,
    EclipseKeys.skipParents in ThisBuild := false,
    scalaVersion := "2.11.6",
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
    libraryDependencies += "akka.js" %%% "akkaactor" % "0.2-SNAPSHOT",
    version := "0.2-SNAPSHOT"
  )

