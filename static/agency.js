
const agencyForm = document.getElementById("agencyForm");
const agencyName = document.getElementById("agencyName");
const agencyError = document.getElementById("agencyError");

if (agencyForm && agencyName && agencyError) {

    agencyForm.addEventListener("submit", function (event) {

        const name = agencyName.value.trim();

        agencyError.textContent = "";
        agencyError.classList.add("d-none");

        if (name.length < 4) {
            event.preventDefault();

            agencyError.textContent =
                "Agency name must be at least 4 characters.";

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

        if (!/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(name)) {
            event.preventDefault();

            agencyError.textContent =
                "Agency name can only contain letters, digits and single spaces.";

            agencyError.classList.remove("d-none");
            return;
        }

        localStorage.setItem("spaceAgencyName", name);
    });

}
