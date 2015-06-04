package calculator

import org.scalatest.path

import scala.scalajs.js
import org.scalajs.dom
import org.scalajs.dom.html
import dom.document
import akka.actor._
import scala.concurrent.duration._
import akka.util.Timeout

abstract class ObservableActor[A <: html.Element](id: String) extends Actor {
  val element = UI.elementById[A](id)

  element.addEventListener("change", (m: dom.Event) => self ! m)
  element.addEventListener("keypress", (m: dom.Event) => self ! m)
  element.addEventListener("keyup", (m: dom.Event) => self ! m)
}

// TWEET

case class TweetMsg(value: Int, color: String)

class TweetUI extends Actor {
  val element = document.getElementById("tweetremainingchars").asInstanceOf[html.Span]

  def receive = {
    case TweetMsg(text, color) =>
      element.textContent = text.toString
      element.style.color = color
  }
}

class Tweet extends ObservableActor[html.TextArea]("tweettext") {
  def value = element.value

  override def preStart() = {
    context.actorOf(Props[TweetUI], "ui")
  }

  def receive = {
    case e: dom.Event =>
      val remaining = TweetLength.tweetRemainingCharsCount(value)
      context.child("ui") match {
        case Some(ui) => ui ! TweetMsg(remaining, TweetLength.colorForRemainingCharsCount(remaining))
      }
  }
}

// POLYNOMIAL

case class PolynomialMsg(delta: Double, solutions: Set[Double])
case class Value(id: Char, newValue: Double)

class PolynomialUI extends Actor {
  val deltaArea = UI.elementById[html.Span]("polyrootdelta")
  val solutionsArea = UI.elementById[html.Span]("polyrootsolutions")

  def receive = {
    case PolynomialMsg(delta, solutions) =>
      deltaArea.textContent = delta.toString
      solutionsArea.textContent = solutions.toString
  }
}

class PolynomialChild(id: String) extends ObservableActor[html.Input](id) {
  import js.JSStringOps._

  def value = element.value

  val childParent = element.parentElement

  def receive = {
    case e =>
      childParent.className = childParent.className.jsReplace(UI.ClearCssClassRegExp, "")
      val newValue: Double =
        try
          value.toDouble
        catch {
          case e: NumberFormatException =>
            childParent.className += " has-error"
            Double.NaN
        }
      context.parent ! Value(id.last, newValue)
  }
}

class APolynomial extends Actor {
  def parent = self

  val names = List("polyroota", "polyrootb", "polyrootc")

  override def preStart() = {
    context.actorOf(Props[PolynomialUI], "ui")
    names map (id => {
      context.actorOf(Props(classOf[PolynomialChild], id), id)
    })
  }

  def receive = operational(names.map(_.last -> Double.NaN).toMap)

  def operational(vals: Map[Char, Double]) : Receive = {
    case Value(id, newValue) =>
      val dVs = vals.map{case (k, v) => k -> Math.pow(v, 2)}

      val delta = Polynomial.computeDelta(dVs('a'), dVs('b'), dVs('c'))

      val solutions = Polynomial.computeSolutions(dVs('a'), dVs('b'), dVs('c'), delta)

      context.child("ui") match {
        case Some(ui) => ui !  PolynomialMsg(delta, solutions)
      }

      context.become(operational(vals + (id -> newValue)))
  }

}

// CALCULATOR

case class ACalculatorMsg(value: Map[Char, Double])
case class ACalculatorExpr(id: Char, value: Expr)
case class IsMine(id: Char, value: Double)

object ACalculatorNames {
  val names = (0 until 10).map(i => ('a' + i).toChar.toString)
}

class ACalculatorUIChild(id: String) extends Actor {
  val elem = UI.elementById[html.Span]("calculatorval" + id)

  def receive = contextify(.0)

  def contextify(state: Double): Receive = {
    case other: Double if state != other =>
      elem.textContent = other.toString

      elem.style.backgroundColor = "#ffff99"
      js.timers.setTimeout(1500) {
        elem.style.backgroundColor = "white"
      }
      context.become(contextify(other))
  }
}

class ACalculatorUI extends Actor {
  import ACalculatorNames._

  override def preStart() = {
    names map (id => {
      context.actorOf(Props(classOf[ACalculatorUIChild], id.last.toString), id.last.toString)
    })
  }

  def receive = {
    case ACalculatorMsg(value) =>
      value.keySet.foreach(k => context.child(k.toString) match {
        case Some(actor) => actor ! value(k)
      })
  }
}

class ACalculatorChild(id: String) extends ObservableActor[html.Input](id) {
  import js.JSStringOps._

  def value = element.value

  val childParent = element.parentElement

  def receive = {
    case e =>
      childParent.className = childParent.className.jsReplace(UI.ClearCssClassRegExp, "")
      val newValue: Expr =
        try {
          parseExpr(value)
        } catch {
          case e: IllegalArgumentException =>
            childParent.className += " has-error"
            Literal(Double.NaN)
        }
      context.parent ! ACalculatorExpr(id.last, newValue)
  }

  def parseExpr(text: String): Expr = {
    def parseSimple(text: String): Expr = {
      if (text.forall(l => l >= 'a' && l <= 'z')) {
        Ref(text.charAt(0))
      } else {
        try {
          Literal(text.toDouble)
        } catch {
          case e: NumberFormatException =>
            throw new IllegalArgumentException(s"$text is neither a variable name nor a number")
        }
      }
    }

    text.split(" ").map(_.trim).filter(_ != "") match {
      case Array(x) => parseSimple(x)
      case Array(aText, op, bText) =>
        val a = parseSimple(aText)
        val b = parseSimple(bText)
        op match {
          case "+" => Plus(a, b)
          case "-" => Minus(a, b)
          case "*" => Times(a, b)
          case "/" => Divide(a, b)
          case _ =>
            throw new IllegalArgumentException(s"$op is not a valid operator")
        }
      case _ =>
        throw new IllegalArgumentException(s"$text is not a valid simple expression")
    }
  }
}

class ACalculator extends Actor {
  def parent = self

  import ACalculatorNames._

  override def preStart() = {
    context.actorOf(Props[ACalculatorUI], "ui")
    names map (id => {
      context.actorOf(Props(classOf[ACalculatorChild], "calculatorexpr" + id), "calculatorexpr" + id)
    })
  }

  def receive = operational(
    names.map(_.last -> Literal(0)).toMap
  )

  def operational(vals: Map[Char, Expr]) : Receive = {
    case ACalculatorExpr(id, newValue) =>
      val newMap: Map[Char, Expr] = vals + (id -> newValue)

      context.child("ui") match {
        case Some(ui) => ui ! ACalculatorMsg(Calculator.computeValues(newMap))
      }

      context.become(operational(newMap))
  }
}



object UI extends js.JSApp {
  val system = ActorSystem("calculator-ui")

  def main(): Unit = {
    try {
      setupTweetMeasurer()
      setup2ndOrderPolynomial()
      setupCalculator()
    } catch {
      case th: Throwable =>
        th.printStackTrace()
    }
  }

  // Helpers

  def elementById[A <: js.Any](id: String): A =
    document.getElementById(id).asInstanceOf[A]


  val ClearCssClassRegExp =
    new js.RegExp(raw"""(?:^|\s)has-error(?!\S)""", "g")

  // TWEET LENGTH

  def setupTweetMeasurer(): Unit = {
    val tweetActor = system.actorOf(Props(classOf[Tweet]))
  }

  // 2ND ORDER POLYNOMIAL

  def setup2ndOrderPolynomial(): Unit = {
    val polynomialActor = system.actorOf(Props(classOf[APolynomial]))
  }

  // CALCULATOR

  def setupCalculator(): Unit = {
    val calculatorActor = system.actorOf(Props(classOf[ACalculator]))
  }

}
