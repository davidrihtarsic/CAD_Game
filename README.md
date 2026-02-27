# 🎯 CAD Game

Interactive web-based training game for practicing **3D CAD modeling from technical drawings**.

Students recreate a 3D model based on a provided technical drawing (PDF) and submit the calculated mass in grams. The system tracks time, attempts, and performance statistics.

---

## 🚀 How It Works

1. Student selects a model (challenge).
2. A blurred thumbnail of the technical drawing is shown.
3. When **START** is pressed:

   * the drawing is revealed,
   * the timer starts,
   * attempts are logged.
4. The student models the part in a CAD program.
5. The student enters the calculated **mass (g)**.
6. The system checks the result within a defined tolerance.
7. Results and performance statistics are recorded.

Density (ρ) is provided in the drawing header.

---

## 🧩 Features

* ⏱ Time tracking (time to first correct result)
* 🔁 Unlimited attempts
* 🎯 Mass tolerance check (default ±1 g)
* 📊 Leaderboard & ranking
* 🏅 Performance badges
* 📈 Group statistics (average time, attempts, percentile)
* ☁ Google Sheets logging via Apps Script backend
* 🌐 Deployable via GitHub Pages

---

## 📂 Project Structure

```
index.html
styles.css
app.js
challenges/
  challenges.json
  model01/
    drawing.pdf
```

---

## 🛠 Backend

This project uses:

* **Google Apps Script (Web App)** as lightweight backend
* **Google Sheets** as database

The Web App handles:

* event logging (start, attempt, success)
* statistics aggregation
* leaderboard ranking
* optional login validation

---

## 🌍 Deployment (GitHub Pages)

1. Push project to a public GitHub repository.
2. Go to **Settings → Pages**.
3. Select branch `main` and folder `/ (root)`.
4. Access the game at:

```
https://YOUR_USERNAME.github.io/REPOSITORY_NAME/
```

---

## 🔐 Security Note

This project is intended for educational use.

Since it runs client-side:

* It is not designed for high-security environments.
* Server-side validation and ranking are recommended.
* Avoid sending passwords via URL parameters.

---

## 🎓 Educational Purpose

Designed for:

* Engineering education
* CAD training
* Technical drawing interpretation
* Mass property verification
* Iterative modeling practice

The game encourages:

* Precision
* Process optimization
* Reflection on modeling workflow
* Performance comparison within a group

---

## 🏆 Example Metrics

* Time to first correct result
* Number of attempts
* Deviation from target mass
* Rank within group
* Percentile performance
* Personal best tracking

---

## 📄 License

Educational use.
Adapt and extend freely for academic purposes.

---

If you’d like, I can also create:

* 🔬 A more research-oriented README (for academic publication)
* 🎮 A more game-oriented README (more dynamic tone)
* 📊 A technical architecture README (for developers)
