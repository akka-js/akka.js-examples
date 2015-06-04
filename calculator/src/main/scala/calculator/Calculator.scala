package calculator

sealed abstract class Expr
final case class Literal(v: Double) extends Expr
final case class Ref(name: Char) extends Expr
final case class Plus(a: Expr, b: Expr) extends Expr
final case class Minus(a: Expr, b: Expr) extends Expr
final case class Times(a: Expr, b: Expr) extends Expr
final case class Divide(a: Expr, b: Expr) extends Expr

object Calculator {
  def computeValues(
      namedExpressions: Map[Char, Expr]): Map[Char, Double] = {
    namedExpressions.map{case (k, exp) => {
      k -> eval(exp, namedExpressions)
    }}
  }

  def eval(expr: Expr, references: Map[Char, Expr]): Double = {
   def compute(expr1: Expr, expr2: Expr,f: (Double,Double) => Double): Double =
    f(eval(expr1, references), eval(expr2, references))
    
    expr match {
      case Literal(d) => d
      case Ref(name) => eval(getReferenceExpr(name, references), references.filterNot(_._1 == name))
      case Plus(x,y) => compute(x,y, _ + _)
      case Minus(x,y) => compute(x,y, _ - _)
      case Times(x,y) => compute(x,y, _ * _)
      case Divide(x,y) => compute(x,y, _ / _)
      case _ => Double.NaN
    }
  }    

  /** Get the Expr for a referenced variables.
   *  If the variable is not known, returns a literal NaN.
   */
  private def getReferenceExpr(name: Char,
      references: Map[Char, Expr]) = {
    references.get(name).fold[Expr] {
      Literal(Double.NaN)
    } { exprSignal =>
      exprSignal
    }
  }
}
