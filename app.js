const express = require("express");
const cors = require("cors");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

let nigerianFoodsDf = [];
const nigerianFoodsCsvPath = path.join(__dirname, "data", "COLLATTEDAJIBABANNNN.csv");

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

function getMealPlans(targetCalories) {
  const seen = new Set();
  const uniqueDiets = nigerianFoodsDf
    .filter(item => item.Energ_Kcal > 0 && !seen.has(item.Shrt_Desc) && seen.add(item.Shrt_Desc))
    .map(item => ({
      description: item.Shrt_Desc,
      calories: item.Energ_Kcal,
      calorie_category: getCalorieCategory(item.Energ_Kcal)
    }))
    // Sort by calories to ensure deterministic results
    .sort((a, b) => a.calories - b.calories || a.description.localeCompare(b.description));

  // Calculate ideal meal calories (target divided by 3-5 meals)
  const mealCalories = targetCalories / 4; // Using 4 as a middle ground between 3-5
  
  // Find foods closest to the ideal meal calories
  const mealOptions = uniqueDiets
    .map(item => ({
      ...item,
      delta: Math.abs(item.calories - mealCalories)
    }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 10); // Get top 10 closest matches

  // Calculate how many times each food should be eaten to reach target
  const mealPlans = mealOptions.map(food => {
    const servings3 = targetCalories / (food.calories * 3);
    const servings5 = targetCalories / (food.calories * 5);
    
    // Find the closest to whole number between 3-5 servings
    const optimalServings = Math.min(5, Math.max(3, Math.round(targetCalories / food.calories)));
    const actualCalories = food.calories * optimalServings;
    
    return {
      food: food.description,
      calories_per_serving: food.calories,
      recommended_servings: optimalServings,
      total_calories: actualCalories,
      calorie_match_percentage: Math.round((actualCalories / targetCalories) * 100)
    };
  });

  return mealPlans;
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
    const mealPlans = getMealPlans(recommendedCalories);

    return res.json({
      recommended_daily_calories: Math.round(recommendedCalories),
      caloric_classification: caloricCategory,
      meal_plans: mealPlans.filter(plan => plan.calorie_match_percentage >= 90) // Only show plans that meet at least 90% of target
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
