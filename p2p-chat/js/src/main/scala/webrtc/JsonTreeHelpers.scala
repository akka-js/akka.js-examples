package eu.unicredit

import scala.scalajs.js
import js.Dynamic.literal
import js.JSON

trait JsonTreeHelpers {

  def emptyRoot(id: String) = {
    val part = literal(root = id)
    part.updateDynamic(id)(literal(
      father = (),
      sons = js.Array()
      ))
    part
  }

  def merge(
    fatherId: String
    )(
    originalTree: js.Dynamic,
    sonTree: js.Dynamic) = {

      val sonId = sonTree.root.toString

      js.Object.keys(sonTree.asInstanceOf[js.Object]).foreach(k => {
        if (k.toString != "root") {
          originalTree.updateDynamic(k)(sonTree.selectDynamic(k))
        }
      })

      val newSubTree = originalTree.selectDynamic(fatherId)
      newSubTree.updateDynamic("sons")(
        newSubTree.sons.asInstanceOf[js.Array[String]] :+ sonId
      )
      originalTree.updateDynamic(fatherId)(newSubTree)

      val newFather = originalTree.selectDynamic(sonId)
      newFather.updateDynamic("father")(
        fatherId
      )
      originalTree.updateDynamic(sonId)(newFather)
      
      originalTree
  }

  def remove(id: String)(
    originalTree: js.Dynamic): js.Dynamic = {
    if (originalTree.root.toString == id)
      throw new Exception("cannot remove root")

    val actual = originalTree.selectDynamic(id)
    val sons = try {
      actual.sons.asInstanceOf[js.Array[String]]
    } catch {
      case _ : Throwable => new js.Array[String]()
    }

    try {
      val fatherId = actual.father.toString
      val newSubTree = 
        originalTree.selectDynamic(fatherId)
      newSubTree.updateDynamic("sons")(
        newSubTree.sons.asInstanceOf[js.Array[String]] - id
      )
      originalTree.updateDynamic(fatherId)(
        newSubTree
      )
    } catch {
      case _ : Throwable =>
    }

    originalTree.updateDynamic(id)(())

    for (son <- sons) {
      remove(son)(originalTree)      
    }

    originalTree
  }


  def keep(id: String)(
    originalTree: js.Dynamic): js.Dynamic = {

    originalTree.updateDynamic("root")(id)

    try {
      js.Object.keys(originalTree.asInstanceOf[js.Object]).foreach(k => {
        if (k.toString != "root" && k.toString != id && !isSonOf(k.toString, id)(originalTree))
          remove(k)(originalTree)
      })
    } catch {
      case _ : Throwable =>
    }

    try {
      val newSubTree = originalTree.selectDynamic(id)
      newSubTree.updateDynamic("father")(())
      originalTree.updateDynamic(id)(newSubTree)
    } catch {
      case _ : Throwable =>
    }

    originalTree
  }

  def isSonOf(id: String, fatherId: String)(tree: js.Dynamic): Boolean = {
    try {
      val directFatherId = tree.selectDynamic(id).father.toString
      directFatherId == fatherId || isSonOf(directFatherId, fatherId)(tree)
    } catch {
      case _ : Throwable => false
    }
  }

}
