package calculator

object Polynomial {
  def computeDelta(a: Double, b: Double,
      c: Double): Double = {
    //Δ = b² - 4ac
    Math.pow(b, 2) - 4*a*c
  }

  def computeSolutions(a: Double, b: Double,
      c: Double, delta: Double): Set[Double] = {
    //(-b ± √Δ) / 2a
      val _delta = delta
      if (_delta<0) Set()
      else {
          val _c = c
          val _b = b
          val _a = a
          val s1 = (-_b + Math.sqrt(_delta)) / (2*_a)
          val s2 = (-_b - Math.sqrt(_delta)) / (2*_a)
          if (s1!=s2) Set(s1,s2)
          else Set(s1)
      }
  }
}
