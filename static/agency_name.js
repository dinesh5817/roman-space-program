const agencyForm = document.getElementById("agencyForm");
const agencyName = document.getElementById("agencyName");
const agencyError = document.getElementById("agencyError");
const vehicleAssemblyTitle = document.getElementById("vehicleAssemblyTitle");

agencyForm.addEventListener("submit", function (event) {
    const name = agencyName.value.trim();

    agencyError.textContent = "";
    agencyError.classList.add("d-none");

    if (name.length <= 3) {
        event.preventDefault();

        agencyError.textContent =
            "Agency name must be greater than 3 characters.";
        agencyError.classList.remove("d-none");
        return;
    }

    if (name.length >= 60) {
        event.preventDefault();

        agencyError.textContent =
            "Agency name must be less than 60 characters.";
        agencyError.classList.remove("d-none");
        return;
    }

    if (!/^[A-Za-z0-9]+$/.test(name)) {
        event.preventDefault();

        agencyError.textContent =
            "Agency name can only contain letters and digits.";
        agencyError.classList.remove("d-none");
        return;
    }

    localStorage.setItem("spaceAgencyName", name);
});

