const express = require("express");
const cors = require("cors");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

let nigerianFoodsDf = [];
const nigerianFoodsCsvPath = path.join(__dirname, "data", "COLLATTEDAJIBABA.csv");

// Load Nigerian foods dataset
fs.createReadStream(nigerianFoodsCsvPath)
  .pipe(csv())
  .on("data", (row) => {
    if (row.Energ_Kcal) row.Energ_Kcal = parseFloat(row.Energ_Kcal);
    nigerianFoodsDf.push(row);
  })
  .on("end", () => {
    console.log("Nigerian foods CSV loaded");
  })
  .on("error", (err) => {
    console.error("Error loading CSV file:", err);
  });

app.use(cors());
app.use(express.json());

// Adjusted calorie estimator
function estimateCalories(age, height, weight, preg_stage, active) {
  const heightCM = height * 100;

  let activityFactor = {
    "Sedentary": 1.2,
    "Light Active": 1.3,
    "Moderately Active": 1.45,
    "Very Active": 1.6,
  }[active] || 1.2;

  let bmr = 10 * weight + 6.25 * heightCM - 5 * age - 161;
  let dailyCalories = bmr * activityFactor;

  // Add pregnancy-based goal
  const trimesterCalories = {
    "FirstTrimester": 85,
    "SecondTrimester": 285,
    "ThirdTrimester": 475,
  }[preg_stage] || 0;

  return dailyCalories + trimesterCalories;
}

function getCalorieCategory(value) {
  if (value < 150) return "low";
  if (value <= 300) return "mid";
  return "high";
}

function getSortedDiets(targetCalories) {
  const seen = new Set();
  const uniqueDiets = nigerianFoodsDf
    .filter(item => item.Energ_Kcal > 0 && !seen.has(item.Shrt_Desc) && seen.add(item.Shrt_Desc))
    .map(item => ({
      description: item.Shrt_Desc,
      calories: item.Energ_Kcal,
      calorie_category: getCalorieCategory(item.Energ_Kcal),
      delta: Math.abs(item.Energ_Kcal - targetCalories)
    }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 10)
    .map(({ delta, ...rest }) => rest); // remove delta from final output

  return uniqueDiets;
}

app.get("/api/top_10_diets", (req, res) => {
  const { age, height, weight, preg_stage, active } = req.query;

  if (!age || !height || !weight || !preg_stage || !active) {
    return res.status(400).json({ error: "Missing required query parameters." });
  }

  const ageNum = parseFloat(age);
  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);

  if (isNaN(ageNum) || isNaN(heightNum) || isNaN(weightNum)) {
    return res.status(400).json({ error: "Age, height, and weight must be valid numbers." });
  }

  try {
    const recommendedCalories = estimateCalories(ageNum, heightNum, weightNum, preg_stage, active);
    const caloricCategory = getCalorieCategory(recommendedCalories);
    const topDiets = getSortedDiets(recommendedCalories);

    return res.json({
      recommended_calories: Math.round(recommendedCalories),
      caloric_classification: caloricCategory,
      top_10_diets: topDiets
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
