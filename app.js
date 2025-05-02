const express = require("express");
const cors = require("cors");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 3000;

// Load the CSV file
let df = [];
let nigerianFoodsDf = [];
let csvPath = path.join(__dirname, "data", "ABBREV.csv");
let nigerianFoodsCsvPath = path.join(__dirname, "data", "COLLATTEDAJIBABA.csv");
console.log("Current directory:", __dirname);
console.log("Looking for CSV at:", csvPath);
console.log("Files in directory:", fs.readdirSync(path.dirname(csvPath)));

fs.createReadStream(path.join(csvPath))
  .pipe(csv())
  .on("data", (row) => {
    // Convert numeric fields from strings to numbers
    if (row.Energ_Kcal) row.Energ_Kcal = parseFloat(row.Energ_Kcal);
    df.push(row);
  })
  .on("end", () => {
    console.log("CSV file successfully loaded");
  })
  .on("error", (err) => {
    console.error("Error loading CSV file:", err);
  });
// Load nigerian foods dataset
fs.createReadStream(path.join(nigerianFoodsCsvPath))
  .pipe(csv())
  .on("data", (row) => {
    // Convert numeric fields from strings to numbers
    if (row.Energ_Kcal) row.Energ_Kcal = parseFloat(row.Energ_Kcal);
    nigerianFoodsDf.push(row);
  })
  .on("end", () => {
    console.log("CSV file successfully loaded");
  })
  .on("error", (err) => {
    console.error("Error loading CSV file:", err);
  });

// Middleware to parse JSON requests
app.use(express.json());

// Enable CORS for all routes
app.use(cors());

// Helper functions
function nutrients(age, height, weight, preg_stage, active) {
  // Convert activity level to multiplier
  let activityMultiplier;
  switch (active) {
    case "Sedentary":
      activityMultiplier = 1.2;
      break;
    case "Light Active":
      activityMultiplier = 1.375;
      break;
    case "Moderately Active":
      activityMultiplier = 1.55;
      break;
    case "Very Active":
      activityMultiplier = 1.75;
      break;
    default:
      activityMultiplier = 1.2; // default to Sedentary
  }

  // Calculate BMI and determine weight category
  const bmi = weight / (height * height);
  let goal;

  if (bmi < 18.5) {
    // Underweight
    switch (preg_stage) {
      case "FirstTrimester":
        goal = 2;
        break;
      case "SecondTrimester":
        goal = 10;
        break;
      case "ThirdTrimester":
        goal = 18;
        break;
    }
  } else if (bmi >= 18.5 && bmi <= 25) {
    // Healthy weight
    switch (preg_stage) {
      case "FirstTrimester":
        goal = 2;
        break;
      case "SecondTrimester":
        goal = 10;
        break;
      case "ThirdTrimester":
        goal = 16;
        break;
    }
  } else {
    // Overweight
    switch (preg_stage) {
      case "FirstTrimester":
        goal = 2;
        break;
      case "SecondTrimester":
        goal = 7;
        break;
      case "ThirdTrimester":
        goal = 11;
        break;
    }
  }

  // Mifflin-St Jeor BMR equation
  const bmr = 10 * weight + 6.25 * (height * 100) - 5 * age - 161;

  // Calculate caloric intake
  const caloric_intake = bmr * activityMultiplier;

  return caloric_intake;
}

function classifyCaloricIntake(caloric_intake) {
  if (caloric_intake < 300) {
    return "low";
  } else if (caloric_intake >= 300 && caloric_intake <= 350) {
    return "mid";
  } else {
    return "high";
  }
}

const getRandomDiets = (caloricIntake) => {
  // 1. Filter foods below the caloric limit
  const filteredDiets = nigerianFoodsDf.filter(
    (item) => item.Energ_Kcal < caloricIntake + 100
  );

  // 2. Shuffle the array to randomize order (Fisher-Yates algorithm)
  const shuffledDiets = [...filteredDiets].sort(() => Math.random() - 0.5);
  const uniqueDiets = [];
  const seenDescriptions = new Set(); // Track descriptions to avoid duplicates

  for (const diet of shuffledDiets) {
    if (!seenDescriptions.has(diet.Shrt_Desc)) {
      uniqueDiets.push({
        description: diet.Shrt_Desc,
        calories: diet.Energ_Kcal,
      });
      seenDescriptions.add(diet.Shrt_Desc);
      if (uniqueDiets.length === 10) break; // Stop once we have 10
    }
  }

  return uniqueDiets;
}

// API endpoint
app.get("/api/top_10_diets", (req, res) => {
  // Extract required query parameters
  const { age, height, weight, preg_stage, active } = req.query;

  // Validate all required parameters are present
  if (!age || !height || !weight || !preg_stage || !active) {
    return res.status(400).json({
      error:
        "All parameters (age, height, weight, preg_stage, active) are required as query strings",
    });
  }

  // Convert numeric parameters to numbers
  const ageNum = parseFloat(age);
  const heightNum = parseFloat(height);
  const weightNum = parseFloat(weight);

  // Validate numeric parameters
  if (isNaN(ageNum) || isNaN(heightNum) || isNaN(weightNum)) {
    return res.status(400).json({
      error: "Age, height, and weight must be valid numbers",
    });
  }

  // Validate pregnancy stage
  const validPregStages = [
    "FirstTrimester",
    "SecondTrimester",
    "ThirdTrimester",
  ];
  if (!validPregStages.includes(preg_stage)) {
    return res.status(400).json({
      error:
        "Invalid pregnancy stage. Must be one of: FirstTrimester, SecondTrimester, ThirdTrimester",
    });
  }

  // Validate activity level
  const validActivityLevels = [
    "Sedentary",
    "Light Active",
    "Moderately Active",
    "Very Active",
  ];
  if (!validActivityLevels.includes(active)) {
    return res.status(400).json({
      error:
        "Invalid activity level. Must be one of: Sedentary, Light Active, Moderately Active, Very Active",
    });
  }

  try {
    // Calculate caloric intake
    const caloricIntake = nutrients(
      ageNum,
      heightNum,
      weightNum,
      preg_stage,
      active
    );
    const classification = classifyCaloricIntake(caloricIntake);

    // Prepare response
    const response = {
      recommended_calories: caloricIntake,
      caloric_classification: classification,
      top_10_diets: getRandomDiets(caloricIntake),
    };

    res.json(response);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
