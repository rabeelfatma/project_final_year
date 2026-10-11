import React from "react";

export default function LearnMoreSection() {
  const points = [
    {
      strong: "AI-Powered Evaluation:",
      text: "Automated evaluation of programming and text-based assignments using Gemini AI.",
    },
    {
      strong: "Role-Based Access:",
      text: "Secure access for Students, Teachers, and Administrators according to their roles.",
    },
    {
      strong: "Assignment Submission:",
      text: "Students can submit programming or text-based assignments for AI evaluation.",
    },
    {
      strong: "Plagiarism Detection:",
      text: "Detects structural similarities between student assignments and generates similarity scores.",
    },
    {
      strong: "Grading & Feedback:",
      text: "Marks are assigned based on AI evaluation results, with feedback available to students and teachers.",
    },
    {
      strong: "Performance Analytics:",
      text: "Teachers can view student progress, class performance, and performance trends.",
    },
    {
      strong: "Evaluation Reports:",
      text: "Teachers can generate detailed evaluation reports for selected assignments and download them.",
    },
  ];

  return (
    <div className="bg-[var(--bg)] text-[var(--text)] min-h-screen transition-colors duration-300">
      <div className="py-20 px-6 md:px-12 text-center">

        <h1 className="text-4xl md:text-5xl font-bold text-sky-400 mb-8 animate-fadeInUp">
          Learn More About QuickCheck Hub
        </h1>

        <p
          className="text-[var(--muted)] max-w-3xl mx-auto mb-8 text-lg md:text-xl animate-fadeInUp text-justify"
          style={{ animationDelay: "100ms" }}
        >
          QuickCheck Hub is a full-stack web application designed to
          streamline assignment evaluation using Artificial Intelligence.
          Key features include:
        </p>

        <ul className="list-disc list-inside text-[var(--muted)] max-w-2xl mx-auto mb-12 text-left space-y-3">
          {points.map((point, index) => (
            <li
              key={index}
              className="animate-fadeInUp transition-colors duration-300 hover:text-sky-300 text-justify"
              style={{
                animationDelay: `${150 + index * 80}ms`,
              }}
            >
              <strong className="text-[var(--text)]">
                {point.strong}
              </strong>{" "}
              {point.text}
            </li>
          ))}
        </ul>

        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById("home")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
          className="inline-block bg-sky-500 px-6 py-3 rounded-xl hover:bg-sky-400 hover:scale-105 transition-all duration-300 animate-fadeInUp cursor-pointer"
          style={{ animationDelay: "800ms" }}
        >
          Back to Home
        </a>

      </div>
    </div>
  );
}