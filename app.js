const express = require("express");
const cors = require("cors");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

let nigerianFoodsDf = [];
const nigerianFoodsCsvPath = path.join(__dirname, "data", "COLLATTEDAJIBABANNNN.csv");

// Load Nigerian foods dataset and add cluster column
fs.createReadStream(nigerianFoodsCsvPath)
  .pipe(csv())
  .on("data", (row) => {
    if (row.Energ_Kcal) row.Energ_Kcal = parseFloat(row.Energ_Kcal);
    // Add cluster based on Python's classification
    row.cluster = row.Energ_Kcal < 300 ? "low" : row.Energ_Kcal <= 350 ? "mid" : "high";
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

// Caloric intake calculation (aligned with Python's nutrients function)
function estimateCalories(age, height, weight, preg_stage, active) {
  const activityFactor = {
    "Sedentary": 1.2,
    "Light Active": 1.375,
    "Moderately Active": 1.55,
    "Very Active": 1.75,
  }[active] || 1.2;

  // Mifflin-St Jeor BMR equation
  const bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  return bmr * activityFactor;
}

// Caloric classification (aligned with Python's classify_caloric_intake)
function getCalorieCategory(value) {
  if (value < 300) return "low";
  if (value <= 350) return "mid";
  return "high";
}

// Diet recommendation (aligned with Python's recommend_diets)
function recommendDiets(caloricLevel, caloricValue, n = 10) {
  const filteredData = nigerianFoodsDf.filter((item) => item.cluster === caloricLevel);
  const sortedDiets = filteredData.sort((a, b) => b.Energ_Kcal - a.Energ_Kcal);
  const recommendedDiets = sortedDiets.filter(
    (item) => item.Energ_Kcal >= caloricValue && item.Energ_Kcal <= caloricValue + 10
  );
  return recommendedDiets.slice(0, n).map((item) => ({
    Shrt_Desc: item.Shrt_Desc,
    Energ_Kcal: item.Energ_Kcal,
  }));
}

// Alternative recommendation (aligned with Python's final cell)
function getTop10Diets(caloricIntake) {
  const sortedDiets = nigerianFoodsDf
    .filter((item) => item.Energ_Kcal < caloricIntake + 100)
    .sort((a, b) => b.Energ_Kcal - a.Energ_Kcal)
    .slice(0, 10);
  return sortedDiets.map((item) => ({
    Shrt_Desc: item.Shrt_Desc,
    Energ_Kcal: item.Energ_Kcal,
  }));
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
    const recommendedDiets = recommendDiets(caloricCategory, recommendedCalories, 5);
    const top10Diets = getTop10Diets(recommendedCalories);

    return res.json({
      recommended_daily_calories: Math.round(recommendedCalories * 100) / 100,
      caloric_classification: caloricCategory,
      recommended_diets: recommendedDiets,
      top_10_diets: top10Diets,
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
