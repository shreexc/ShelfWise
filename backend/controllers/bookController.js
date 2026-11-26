import Issue from "../models/Issue.js";
import User from "../models/User.js";
import FineSetting from "../models/FineSetting.js";
import { registerUser } from "./authController.js";
import { recordStreamErrors } from "nodemailer/lib/shared";

// Days and Fines

const getLocalIsoDate = (value = new Date()) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getStartOfDay = (value) => new Date(new Date(value).setHours(0, 0, 0, 0));

const getDiffInDays = (targetDateString) =>
  Math.round(
    (getStartOfDay(targetDateString) - getStartOfDay(new Date())) / 86400000,
  );

const getOverdueUnits = (overdueDays, interval) => {
  if (overdueDays <= 0) return 0;
  const divisor = { week: 7, month: 30, year: 365 }[interval] || 1;
  return Math.ceil(overdueDays / divisor);
};

const calculateFine = (issue, fineRate = 10, fineInterval = "day") => {
  if (!issue || issue.fineCleared || issue.returnedOn) return 0;
  const overdueDays = Math.max(0, -getDiffInDays(issue.dueDate));
  return (
    getOverdueUnits(overdueDays, fineInterval) * fineRate +
    (Number(issue.manualFine) || 0)
  );
};

// Book Issue

export async function issueManualBooks(req, res) {
  try {
    const { studentDetails, books } = req.body;
    if (!Array.isArray(books) || books.length === 0) {
      return res.status(400).json({
        message: "No books were entered",
      });
    }
    const student = await User.findOne({ rollNo: studentDetails.rollNumber });
    if (!student)
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });

    const todayIso = getLocalIsoDate();
    const validBooks = books.filter((b) => b.title && b.bookCode && b.dueDate);
    if (validBooks.length === 0) {
      return res.status(400).json({
        message: "Add atleast one valid book with code and due date",
      });
    }
    const createdIssues = await Promise.all(
      validBooks.map((book) =>
        Issue.create({
          source: "manual",
          bookCode: book.bookCode.trim(),
          title: book.title.trim(),
          userEmail: student.email,
          userName: student.name,
          issuedOn: todayIso,
          dueDate: book.dueDate,
          returnedOn: null,
          fineRate: Number(book.fineRate ?? req.body.fineRate ?? 10),
          fineInterval: book.fineInterval ?? req.body.fineInterval ?? "day",
          manualFine: 0,
          fineCleared: false,
          clearedFineAmount: 0,
          department:
            studentDetails.department?.trim() ||
            student.department ||
            "General",
          stream: studentDetails.stream?.trim() || student.stream || "General",
          semester:
            studentDetails.semester?.trim() || student.semester || "Semester 1",
          rollNumber:
            studentDetails.rollNumber?.trim() ||
            student.rollNo ||
            "Not assigned",
          studentId: student.rollNo || `ST-${student._id.toString().slice(-4)}`,
        }),
      ),
    );
    res.status(201).json({
      success: true,
      message: `${createdIssues.length} books issued successfully`,
      count: createdIssues.length,
      issues: createdIssues,
    });
  } catch (error) {
    console.error("Error issuing manual books:", error);
    res.status(500).json({
      message: "Error issuing manual books:",
      error: error.message,
    });
  }
}

// Get all issues

export async function getIssues(req, res) {
  try {
    const issues = (await Issue.find({})).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      issues,
    });
  } catch (error) {
    console.error("Error fetching issues:", error);
    res.status(500).json({
      message: "Error fetching issues:",
      error: error.message,
    });
  }
}

// getting issues for students logged-in students

export async function getStudentIssues(req, res) {
  try {
    const issues = await Issue.find({
      userEmail: req.user.email.toLowerCase().trim(),
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, issues });
  } catch (error) {
    console.error("Error fetching student issues:", error);
    res.status(500).json({
      message: "Error fetching student issues:",
      error: error.message,
    });
  }
}

// returning issued book

export async function returnBook(req, res) {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue)
      return res.status(404).json({
        message: "Record not found",
      });

    if (issue.returnedOn)
      return res.status(400).json({
        message: "Book already returned",
      });
    issue.returnedOn = getLocalIsoDate();
    await issue.save();
    res.status(200).json({
      success: true,
      message: "Book returned successfully",
      issue,
    });
  } catch (error) {
    console.error("Error returning book:", error);
    res.status(500).json({
      message: "Error returning book:",
      error: error.message,
    });
  }
}

// fine

export async function applyFine(req, res) {
  try {
    const fineAmount = Number(req.body.amount);
    if (Number.isNaN(fineAmount))
      return res.status(400).json({
        message: "Invalid fine amount",
      });

    const issue = await Issue.findById(req.params.id);
    if (!issue)
      return res.status(404).json({
        message: "Record not found",
      });
    issue.manualFine = fineAmount;
    if (fineAmount > 0) issue.fineCleared = false;
    await issue.save();
    res.status(200).json({
      success: true,
      message: "Fine applied successfully",
      issue,
    });
  } catch (error) {
    console.error("Error appying fine:", error);
    res.status(500).json({
      message: "Error appying fine:",
      error: error.message,
    });
  }
}

// fine clearance

export async function clearFine(req, res) {
  try {
    const issue = await Issue.findById(req.params.id);
    if (!issue)
      return res.status(404).json({
        message: "Record not found",
      });
    Object.assign(issue, {
      manualFine: 0,
      fineCleared: true,
      clearedFineAmount: calculateFine(
        issue,
        issue.fineRate,
        issue.fineInterval,
      ),
    });
    await issue.save();

    res.status(200).json({
      success: true,
      message: "Fine cleared successfully",
      issue,
    });
  } catch (error) {
    console.error("Error clearing fine:", error);
    res.status(500).json({
      message: "Error clearing fine:",
      error: error.message,
    });
  }
}

// Active fine settings

export async function getFineSettings(req, res) {
  try {
    const settings =
      (await FineSetting.findOne()) ||
      (await FineSetting.create({ amount: 10, interval: "day" }));
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("Error fetching fine setting:", error);
    res.status(500).json({
      message: "Error fetching fine setting:",
      error: error.message,
    });
  }
}

// update fine settings

export async function updateFineSetting(req, res) {
  try {
    const { amount, interval } = req.body;
    let settings = await FineSetting.findOne({});
    if (settings) {
      if (amount !== undefined) settings.amount = Number(amount);
      if (interval !== undefined) settings.interval = interval;
      await settings.save();
    } else {
      settings = await FineSetting.create({
        amount: Number(amount) || 10,
        interval: interval || "day",
      });
    }
    res.status(200).json({
      success: true,
      message: "Fine settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Error updating fine setting:", error);
    res.status(500).json({
      message: "Error updating fine setting:",
      error: error.message,
    });
  }
}
