package eu.unicredit

object Main extends App {

  println("JVM env")

  val defaultConfig = com.typesafe.config.ConfigFactory.load()

  Run.run

}
