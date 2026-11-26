import User from "../models/User.js";

export async function searchStudentsByRoll(req, res) {
  try {
    const search = String(req.query.search || req.query.roll || "").trim();
    if (!search) {
      return res.status(200).json({
        success: true,
        students: [],
      });
    }
    const searchRegex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    const students = await User.find({
      role: "user",
      isProfileComplete: true,
      $or: [{ name: { $regex: searchRegex } }, { rollNo: { $regex: searchRegex } }],
    })
      .select("name email department stream semester rollNo")
      .limit(12);

    const mappedStudents = students.map((student) => ({
      name: student.name,
      email: student.email,
      department: student.department || "",
      stream: student.stream || "",
      semester: student.semester || "",
      rollNumber: student.rollNo || "",
    }));
    res.status(200).json({
      success: true,
      students: mappedStudents,
    });
  } catch (error) {
    console.error("Error searching students:", error);
    res.status(500).json({
      success: false,
      message: "Error searching students by roll number",
      error: error.message,
    });
  }
}
