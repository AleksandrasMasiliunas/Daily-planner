# Hourly Planner

A clean, minimal hourly day planner. Plan your day hour by hour, pin your top 3 priorities, run focus timers, and track your progress over the week. Built with plain HTML, CSS and JavaScript, with no dependencies.

## Features

- One row per hour, with tasks you can add, edit, tick off and remove
- Exact start times, for example 06:30 (pick a time, or type `6:30 gym`)
- Top 3 priorities pinned at the top of the page
- Focus timer (15, 25, 45 or 60 minutes) with automatic 5 minute breaks
- Plan tomorrow ahead of time and move unfinished tasks forward
- Last 7 days view with completion rate, day streak and focus minutes
- Adjustable day start and end hours
- Light and dark mode that follow your device

## Files

- `index.html` - the page layout
- `style.css` - all the styling
- `script.js` - the planner logic (tasks, timer, saving, the weekly chart)

## Use it

Download all three files into the same folder and open `index.html` in a browser. There is nothing to install or build.

Tasks are saved in the browser's local storage, so they stay on the device you use.

## Host it for free

1. Push the files to a GitHub repository.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. The planner will be live at `https://<your-username>.github.io/<repository-name>/`.
