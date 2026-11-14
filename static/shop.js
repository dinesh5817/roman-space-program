const vehicleAssemblyTitle = document.getElementById("vehicleAssemblyTitle");

const agencyName = localStorage.getItem("spaceAgencyName");

vehicleAssemblyTitle.textContent =
    `${agencyName}'s Vehicle Assembly`;