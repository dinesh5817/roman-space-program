
document.addEventListener("DOMContentLoaded", () => {

    const buttons = document.querySelectorAll(".select-window");

    buttons.forEach(button => {

        button.addEventListener("click", () => {

            // Collect the selected launch window
            const selectedWindow = {
                name: button.dataset.name,
                date: button.dataset.date,
                time: button.dataset.time,
                weather: button.dataset.weather,
                difficulty: Number(button.dataset.difficulty)
            };

            // Store the selected window in localStorage
            localStorage.setItem(
                "selectedWindow",
                JSON.stringify(selectedWindow)
            );

            // Navigate to the flight page
            window.location.href = button.dataset.flightUrl;

        });

    });

});
