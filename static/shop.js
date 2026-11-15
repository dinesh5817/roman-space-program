// ==================================================
// CONSTANTS
// ==================================================

const BUDGET = 4000; // $4.00B internally represented as $4,000M

const MIN_TWR = 1.08;
const MAX_TWR = 1.70;
const REQUIRED_DELTA_V = 9400; // m/s

const PAYLOAD_MASS = 5000;
const G0 = 9.81;


// ==================================================
// VEHICLE STATE
// ==================================================

function createEmptyStage() {
    return {
        engine: null,
        tanks: [],
        decoupler: null
    };
}

let rocket = {
    stages: [createEmptyStage()],
    boosterCount: 0,
    boosterEngine: null,
    boosterFuelTank: null,
    boosterFuelTankCount: 4,
    radio: null
};

let activeStageIndex = 0;

let enginePicker = {
    name: null,
    stageIndex: null,
    quantity: 4
};

let tankPicker = {
    name: null,
    stageIndex: null,
    quantity: 4
};

let history = [];

let hasUnsavedChanges = false;


// ==================================================
// ENGINE CATALOG
// ==================================================

const engines = [
    { name: "RS-25", cost: 250 / 15, mass: 3500, thrust: 1860, isp: 366, type: "sea" },
    { name: "Sea-Level Raptors", cost: 200 / 15, mass: 1600, thrust: 2200, isp: 330, type: "sea" },
    { name: "Vacuum Raptors", cost: 200 / 15, mass: 1600, thrust: 2300, isp: 380, type: "vac" },
    { name: "RL10", cost: 180 / 15, mass: 300, thrust: 110, isp: 450, type: "vac" },
    { name: "Solid Motor Alpha", cost: 90 / 15, mass: 8000, thrust: 1200, isp: 250, type: "solid" },
    { name: "Solid Motor Beta", cost: 120 / 15, mass: 10000, thrust: 1500, isp: 260, type: "solid" }
];


// ==================================================
// TANK CATALOG
// ==================================================

const tanks = [
    { name: "Kerolox Tank", cost: 120 / 15, mass: 3600, fuel: 8000, fuelType: "liquid" },
    { name: "Methalox Tank", cost: 150 / 15, mass: 3300, fuel: 7500, fuelType: "liquid" },
    { name: "Hydrolox Tank", cost: 180 / 15, mass: 2700, fuel: 6000, fuelType: "liquid" },
    { name: "Solid Grain", cost: 60 / 15, mass: 1500, fuel: 7000, fuelType: "solid" }
];


// ==================================================
// DECOUPLER CATALOG
// ==================================================

const decouplers = [
    { name: "Standard Decoupler", cost: 60 / 15, mass: 250 }
];


// ==================================================
// RADIO CATALOG
// ==================================================

const radios = [
    { name: "Basic", cost: 30 / 15, latency: 3.0 },
    { name: "Standard", cost: 60 / 15, latency: 2.0 },
    { name: "Good", cost: 90 / 15, latency: 1.5 },
    { name: "Premium", cost: 150 / 15, latency: 1.0 }
];


// ==================================================
// AGENCY NAME IN VAB
// ==================================================

function updateAgencyTitle() {

    const savedAgencyName =
        localStorage.getItem("spaceAgencyName");

    const vehicleAssemblyTitle =
        document.getElementById("vehicleAssemblyTitle");

    if (savedAgencyName && vehicleAssemblyTitle) {

        vehicleAssemblyTitle.textContent =
            `${savedAgencyName}'s VAB`;
    }
}


// ==================================================
// HISTORY / UNDO
// ==================================================

function saveHistory() {

    history.push(JSON.stringify({
        rocket,
        activeStageIndex,
        enginePicker,
        tankPicker
    }));

    if (history.length > 30) {
        history.shift();
    }

    hasUnsavedChanges = true;
}


function undoAction() {

    if (history.length === 0) return;

    const previous = JSON.parse(history.pop());

    rocket = previous.rocket;
    activeStageIndex = previous.activeStageIndex;
    enginePicker = previous.enginePicker;

    tankPicker = previous.tankPicker || {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    hasUnsavedChanges = true;

    renderAll();
}


function resetAssembly() {

    saveHistory();

    rocket = {
        stages: [createEmptyStage()],
        boosterCount: 0,
        boosterEngine: null,
        boosterFuelTank: null,
        boosterFuelTankCount: 4,
        radio: null
    };

    activeStageIndex = 0;

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


// ==================================================
// STAGE SELECTION
// ==================================================

function getActiveStage() {

    return rocket.stages[activeStageIndex];
}


function selectStage(index) {

    if (index < 0 || index >= rocket.stages.length) return;

    activeStageIndex = index;

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


// ==================================================
// ENGINE / TANK QUANTITY SELECTORS
// ==================================================

function changeEngineQuantity(amount) {

    enginePicker.quantity = Math.max(
        1,
        enginePicker.quantity + amount
    );

    renderCatalog("engine");
}


function changeTankQuantity(amount) {

    tankPicker.quantity = Math.max(
        1,
        tankPicker.quantity + amount
    );

    renderCatalog("tank");
}


// ==================================================
// ENGINE SELECTION
// ==================================================

function selectEngine(engine) {

    const stage = getActiveStage();

    if (!stage || stage.engine !== null) return;

    if (
        enginePicker.name !== engine.name ||
        enginePicker.stageIndex !== activeStageIndex
    ) return;

    saveHistory();

    stage.engine = {
        name: engine.name,
        engineType: engine.type,
        quantity: enginePicker.quantity,
        cost: engine.cost,
        mass: engine.mass,
        thrust: engine.thrust,
        isp: engine.isp
    };

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


// ==================================================
// COMPONENT ELIGIBILITY
// ==================================================

function canAddPart(kind, item) {

    const stage = getActiveStage();

    if (!stage) return false;

    if (kind === "engine") {
        return stage.engine === null;
    }

    if (kind === "tank") {

        if (!stage.engine) return false;

        const requiredType =
            stage.engine.engineType === "solid"
                ? "solid"
                : "liquid";

        return item.fuelType === requiredType;
    }

    if (kind === "decoupler") {

        return (
            stage.engine !== null &&
            stage.tanks.length > 0 &&
            stage.decoupler === null
        );
    }

    return false;
}


// ==================================================
// ADD TANKS AND DECOUPLERS
// ==================================================

function addTank(tank, quantity = 1) {

    const stage = getActiveStage();

    if (!canAddPart("tank", tank)) return;

    saveHistory();

    for (let i = 0; i < quantity; i++) {

        stage.tanks.push({
            name: tank.name,
            cost: tank.cost,
            mass: tank.mass,
            fuel: tank.fuel,
            fuelType: tank.fuelType
        });
    }

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


function addDecoupler(decoupler) {

    const stage = getActiveStage();

    if (!canAddPart("decoupler", decoupler)) return;

    saveHistory();

    stage.decoupler = {
        name: decoupler.name,
        cost: decoupler.cost,
        mass: decoupler.mass
    };

    const isFinalStage =
        activeStageIndex === rocket.stages.length - 1;

    if (isFinalStage) {
        rocket.stages.push(createEmptyStage());
    }

    activeStageIndex++;

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


// ==================================================
// REMOVE COMPONENTS
// ==================================================

function removeEngine(stageIndex) {

    saveHistory();

    rocket.stages[stageIndex].engine = null;

    activeStageIndex = stageIndex;

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


function removeTank(stageIndex, tankIndex) {

    saveHistory();

    rocket.stages[stageIndex].tanks.splice(tankIndex, 1);

    activeStageIndex = stageIndex;

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


function removeDecoupler(stageIndex) {

    saveHistory();

    rocket.stages[stageIndex].decoupler = null;

    activeStageIndex = stageIndex;

    enginePicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    tankPicker = {
        name: null,
        stageIndex: null,
        quantity: 4
    };

    renderAll();
}


// ==================================================
// VALIDATE EVERY STAGE
// ==================================================

function validateBuild() {

    if (rocket.stages.length === 0) {
        return {
            valid: false,
            reason: "No stages found."
        };
    }

    for (let i = 0; i < rocket.stages.length; i++) {

        const stage = rocket.stages[i];
        const stageNumber = i + 1;

        if (!stage.engine) {
            return {
                valid: false,
                reason: `Stage ${stageNumber} is missing an engine.`
            };
        }

        if (
            !Number.isInteger(stage.engine.quantity) ||
            stage.engine.quantity < 1
        ) {
            return {
                valid: false,
                reason: `Stage ${stageNumber} has an invalid engine quantity.`
            };
        }

        if (stage.tanks.length === 0) {
            return {
                valid: false,
                reason: `Stage ${stageNumber} is missing a propellant tank.`
            };
        }

        const requiredFuel =
            stage.engine.engineType === "solid"
                ? "solid"
                : "liquid";

        for (const tank of stage.tanks) {

            if (tank.fuelType !== requiredFuel) {
                return {
                    valid: false,
                    reason: `Stage ${stageNumber} has an incompatible tank.`
                };
            }
        }

        if (
            i < rocket.stages.length - 1 &&
            !stage.decoupler
        ) {
            return {
                valid: false,
                reason: `Stage ${stageNumber} is missing a decoupler.`
            };
        }

        if (
            i === rocket.stages.length - 1 &&
            stage.decoupler
        ) {
            return {
                valid: false,
                reason: `Stage ${stageNumber} has no following stage.`
            };
        }
    }

    return {
        valid: true,
        reason: "All stages passed structural validation."
    };
}


// ==================================================
// CATALOG CARD CREATION
// ==================================================

function createCard(
    title,
    details,
    buttonText,
    onClick,
    disabled = false
) {

    const column = document.createElement("div");
    column.className = "col-md-6 col-lg-4";

    const card = document.createElement("div");
    card.className = "part-card";

    const heading = document.createElement("h5");
    heading.textContent = title;

    const detailContainer = document.createElement("div");

    details.forEach(detail => {

        const line = document.createElement("p");

        line.className = "part-stat mb-1";
        line.textContent = detail;

        detailContainer.appendChild(line);
    });

    const button = document.createElement("button");

    button.type = "button";
    button.className = "btn btn-outline-info w-100 mt-3";
    button.textContent = buttonText;
    button.disabled = disabled;

    button.addEventListener("click", onClick);

    card.append(heading, detailContainer, button);
    column.appendChild(card);

    return column;
}


// ==================================================
// ENGINE / TANK / DECOUPLER CATALOGS
// ==================================================

function renderCatalog(kind) {

    const container = document.getElementById(
        kind === "engine"
            ? "engineList"
            : kind === "tank"
                ? "tankList"
                : "decouplerList"
    );

    container.innerHTML = "";

    const catalog =
        kind === "engine"
            ? engines
            : kind === "tank"
                ? tanks
                : decouplers;

    const stage = getActiveStage();

    catalog.forEach(item => {

        const allowed = canAddPart(kind, item);

        let details = [];

        if (kind === "engine") {

            details = [
                `Unit cost: $${item.cost.toFixed(2)}M`,
                `Dry mass: ${item.mass.toLocaleString()} kg`,
                `Thrust: ${item.thrust.toLocaleString()} kN`,
                `Isp: ${item.isp} s`,
                `Engine type: ${item.type}`
            ];
        }

        if (kind === "tank") {

            details = [
                `Cost: $${item.cost.toFixed(2)}M`,
                `Dry mass: ${item.mass.toLocaleString()} kg`,
                `Propellant: ${item.fuel.toLocaleString()} kg`,
                `Fuel type: ${item.fuelType}`
            ];
        }

        if (kind === "decoupler") {

            details = [
                `Cost: $${item.cost.toFixed(2)}M`,
                `Mass: ${item.mass.toLocaleString()} kg`
            ];
        }

        const column = createCard(
            item.name,
            details,
            kind === "engine"
                ? "Choose Engine"
                : `Add ${item.name}`,
            () => {

                if (!allowed) return;

                if (kind === "engine") {

                    enginePicker = {
                        name: item.name,
                        stageIndex: activeStageIndex,
                        quantity: 4
                    };

                    renderCatalog("engine");
                }

                if (kind === "tank") {

                    tankPicker = {
                        name: item.name,
                        stageIndex: activeStageIndex,
                        quantity: 4
                    };

                    renderCatalog("tank");
                }

                if (kind === "decoupler") {
                    addDecoupler(item);
                }
            },
            !allowed
        );

        const card = column.querySelector(".part-card");

        // ==================================================
        // ENGINE QUANTITY PICKER
        // ==================================================

        if (
            kind === "engine" &&
            enginePicker.name === item.name &&
            enginePicker.stageIndex === activeStageIndex
        ) {

            card.classList.add("selected");

            const picker = document.createElement("div");
            picker.className = "quantity-picker mt-3";

            const label = document.createElement("div");
            label.className = "small mb-2";
            label.textContent = "Number of engines";

            const controls = document.createElement("div");

            controls.className =
                "d-flex align-items-center justify-content-center gap-3";

            const minus = document.createElement("button");

            minus.type = "button";
            minus.className = "btn btn-outline-light";
            minus.textContent = "−";
            minus.disabled = enginePicker.quantity <= 1;

            minus.addEventListener("click", () => {
                changeEngineQuantity(-1);
            });

            const quantity = document.createElement("strong");

            quantity.className = "fs-4";
            quantity.textContent = enginePicker.quantity;

            const plus = document.createElement("button");

            plus.type = "button";
            plus.className = "btn btn-outline-light";
            plus.textContent = "+";

            // No maximum engine quantity.
            plus.disabled = false;

            plus.addEventListener("click", () => {
                changeEngineQuantity(1);
            });

            controls.append(minus, quantity, plus);

            const total = document.createElement("p");

            total.className = "small text-secondary mt-2 mb-0";

            total.textContent =
                `Total thrust: ${(item.thrust * enginePicker.quantity).toLocaleString()} kN`;

            const addButton = document.createElement("button");

            addButton.type = "button";
            addButton.className = "btn btn-info w-100 mt-3";

            addButton.textContent =
                `Add ${enginePicker.quantity} Engines`;

            addButton.addEventListener("click", () => {
                selectEngine(item);
            });

            picker.append(
                label,
                controls,
                total,
                addButton
            );

            card.appendChild(picker);
        }

        // ==================================================
        // TANK QUANTITY PICKER
        // ==================================================

        if (
            kind === "tank" &&
            tankPicker.name === item.name &&
            tankPicker.stageIndex === activeStageIndex
        ) {

            card.classList.add("selected");

            const picker = document.createElement("div");
            picker.className = "quantity-picker mt-3";

            const label = document.createElement("div");
            label.className = "small mb-2";
            label.textContent = "Number of fuel tanks";

            const controls = document.createElement("div");

            controls.className =
                "d-flex align-items-center justify-content-center gap-3";

            const minus = document.createElement("button");

            minus.type = "button";
            minus.className = "btn btn-outline-light";
            minus.textContent = "−";
            minus.disabled = tankPicker.quantity <= 1;

            minus.addEventListener("click", () => {
                changeTankQuantity(-1);
            });

            const quantity = document.createElement("strong");

            quantity.className = "fs-4";
            quantity.textContent = tankPicker.quantity;

            const plus = document.createElement("button");

            plus.type = "button";
            plus.className = "btn btn-outline-light";
            plus.textContent = "+";

            // No maximum tank quantity.
            plus.disabled = false;

            plus.addEventListener("click", () => {
                changeTankQuantity(1);
            });

            controls.append(minus, quantity, plus);

            const totalFuel = document.createElement("p");

            totalFuel.className =
                "small text-secondary mt-2 mb-0";

            totalFuel.textContent =
                `Total propellant: ${(item.fuel * tankPicker.quantity).toLocaleString()} kg`;

            const addButton = document.createElement("button");

            addButton.type = "button";
            addButton.className = "btn btn-info w-100 mt-3";

            addButton.textContent =
                `Add ${tankPicker.quantity} ${tankPicker.quantity === 1 ? "Tank" : "Tanks"}`;

            addButton.addEventListener("click", () => {
                addTank(item, tankPicker.quantity);
            });

            picker.append(
                label,
                controls,
                totalFuel,
                addButton
            );

            card.appendChild(picker);
        }

        container.appendChild(column);
    });

    if (kind === "engine" && stage.engine) {

        const notice = document.createElement("p");

        notice.className = "text-secondary small";

        notice.textContent =
            `Stage ${activeStageIndex + 1} already has an engine. Remove it from the manifest to replace it.`;

        container.prepend(notice);
    }
}


// ==================================================
// STAGE MANIFEST
// ==================================================

function createRemoveButton(label, callback) {

    const button = document.createElement("button");

    button.type = "button";
    button.className = "btn btn-sm btn-outline-danger";
    button.textContent = label;

    button.addEventListener("click", callback);

    return button;
}


function renderManifest() {

    const container = document.getElementById("assemblyManifest");

    container.innerHTML = "";

    rocket.stages.forEach((stage, stageIndex) => {

        const card = document.createElement("div");

        card.className =
            "list-group-item manifest-item mb-2 stage-card";

        if (stageIndex === activeStageIndex) {
            card.classList.add("active-stage");
        }

        const header = document.createElement("div");

        header.className =
            "d-flex justify-content-between align-items-center mb-2";

        const title = document.createElement("strong");

        title.textContent = `Stage ${stageIndex + 1}`;

        const selectButton = document.createElement("button");

        selectButton.type = "button";
        selectButton.className = "btn btn-sm btn-outline-info";

        selectButton.textContent =
            stageIndex === activeStageIndex
                ? "Editing"
                : "Edit Stage";

        selectButton.disabled = stageIndex === activeStageIndex;

        selectButton.addEventListener("click", () => {
            selectStage(stageIndex);
        });

        header.append(title, selectButton);

        card.appendChild(header);


        // ==================================================
        // ENGINE
        // ==================================================

        const engineRow = document.createElement("div");

        engineRow.className =
            "d-flex justify-content-between align-items-center mb-2";

        const engineText = document.createElement("span");

        engineText.textContent = stage.engine
            ? `${stage.engine.name} × ${stage.engine.quantity}`
            : "Engine: Missing";

        engineRow.appendChild(engineText);

        if (stage.engine) {

            engineRow.appendChild(
                createRemoveButton("Remove", () => {
                    removeEngine(stageIndex);
                })
            );
        }

        card.appendChild(engineRow);


        // ==================================================
        // TANKS
        // ==================================================

        if (stage.tanks.length === 0) {

            const missing = document.createElement("p");

            missing.className = "small text-danger mb-2";
            missing.textContent = "Propellant tank: Missing";

            card.appendChild(missing);
        }

        stage.tanks.forEach((tank, tankIndex) => {

            const tankRow = document.createElement("div");

            tankRow.className =
                "d-flex justify-content-between align-items-center mb-2";

            const tankText = document.createElement("span");

            tankText.textContent = tank.name;

            tankRow.append(
                tankText,
                createRemoveButton("Remove", () => {
                    removeTank(stageIndex, tankIndex);
                })
            );

            card.appendChild(tankRow);
        });


        // ==================================================
        // DECOUPLER
        // ==================================================

        const decouplerRow = document.createElement("div");

        decouplerRow.className =
            "d-flex justify-content-between align-items-center";

        const decouplerText = document.createElement("span");

        decouplerText.textContent = stage.decoupler
            ? stage.decoupler.name
            : stageIndex === rocket.stages.length - 1
                ? "Final stage"
                : "Decoupler: Missing";

        decouplerRow.appendChild(decouplerText);

        if (stage.decoupler) {

            decouplerRow.appendChild(
                createRemoveButton("Remove", () => {
                    removeDecoupler(stageIndex);
                })
            );
        }

        card.appendChild(decouplerRow);

        container.appendChild(card);
    });


    // ==================================================
    // BOOSTER MANIFEST
    // ==================================================

    if (rocket.boosterCount > 0) {

        const booster = document.createElement("div");

        booster.className = "list-group-item manifest-item";

        booster.textContent = rocket.boosterEngine
            ? `${rocket.boosterCount} × ${rocket.boosterEngine.name} boosters; ${
                rocket.boosterFuelTank
                    ? `${rocket.boosterFuelTankCount} × ${rocket.boosterFuelTank.name} per booster`
                    : "solid fuel tank missing"
            }`
            : `${rocket.boosterCount} boosters: Engine missing`;

        const remove = createRemoveButton("Remove", () => {

            saveHistory();

            rocket.boosterCount = 0;
            rocket.boosterEngine = null;
            rocket.boosterFuelTank = null;
            rocket.boosterFuelTankCount = 4;

            renderAll();
        });

        booster.appendChild(remove);

        container.appendChild(booster);
    }


    // ==================================================
    // RADIO MANIFEST
    // ==================================================

    if (rocket.radio) {

        const radio = document.createElement("div");

        radio.className =
            "list-group-item manifest-item d-flex justify-content-between align-items-center";

        const text = document.createElement("span");

        text.textContent = `${rocket.radio.name} Radio`;

        radio.append(
            text,
            createRemoveButton("Remove", () => {

                saveHistory();

                rocket.radio = null;

                renderAll();
            })
        );

        container.appendChild(radio);
    }
}


// ==================================================
// BOOSTERS
// ==================================================

function selectBoosterCount(count) {

    saveHistory();

    rocket.boosterCount = count;
    rocket.boosterEngine = null;

    if (count === 0) {
        rocket.boosterFuelTank = null;
        rocket.boosterFuelTankCount = 4;
    }

    renderAll();
}


function changeBoosterFuelTankCount(amount) {
    if (!rocket.boosterFuelTank) {
        return;
    }

    saveHistory();

    rocket.boosterFuelTankCount = Math.max(
        1,
        Math.min(
            20,
            rocket.boosterFuelTankCount + amount
        )
    );

    renderAll();
}


function renderBoosters() {

    const container = document.getElementById("boosterBuilder");

    container.innerHTML = "";

    document.querySelectorAll("#boosterCount button").forEach(button => {

        button.classList.toggle(
            "active",
            Number(button.dataset.count) === rocket.boosterCount
        );
    });

    if (rocket.boosterCount === 0) {

        container.textContent = "No side boosters selected.";

        return;
    }

    const heading = document.createElement("p");

    heading.className = "col-12 text-secondary";

    heading.textContent =
        `Choose an engine and solid fuel tanks for each of your ${rocket.boosterCount} boosters.`;

    container.appendChild(heading);

    engines
        .filter(engine => engine.type === "solid")
        .forEach(engine => {

            const column = createCard(
                engine.name,
                [
                    `Unit cost: $${engine.cost.toFixed(2)}M`,
                    `Unit mass: ${engine.mass.toLocaleString()} kg`,
                    `Unit thrust: ${engine.thrust.toLocaleString()} kN`,
                    `Isp: ${engine.isp} s`,
                    `Total cost: $${(engine.cost * rocket.boosterCount).toFixed(2)}M`
                ],
                rocket.boosterEngine?.name === engine.name
                    ? "Selected"
                    : "Select Booster",
                () => {

                    saveHistory();

                    rocket.boosterEngine = engine;

                    renderAll();
                }
            );

            container.appendChild(column);
        });

    const solidFuelTank =
        tanks.find(tank => tank.fuelType === "solid");

    if (solidFuelTank) {
        const selected =
            rocket.boosterFuelTank?.name === solidFuelTank.name;

        const fuelTankColumn = createCard(
            solidFuelTank.name,
            [
                `Unit cost: $${solidFuelTank.cost.toFixed(2)}M`,
                `Dry mass: ${solidFuelTank.mass.toLocaleString()} kg`,
                `Fuel: ${solidFuelTank.fuel.toLocaleString()} kg`,
                selected
                    ? `Total fuel: ${(
                        solidFuelTank.fuel *
                        rocket.boosterFuelTankCount *
                        rocket.boosterCount
                    ).toLocaleString()} kg`
                    : "Solid propellant for each booster"
            ],
            selected ? "Selected" : "Select Solid Fuel",
            () => {
                if (selected) {
                    return;
                }

                saveHistory();

                rocket.boosterFuelTank = {
                    ...solidFuelTank
                };
                rocket.boosterFuelTankCount = 4;

                renderAll();
            }
        );

        if (selected) {
            const fuelTankCard =
                fuelTankColumn.querySelector(".part-card");

            const picker =
                document.createElement("div");
            picker.className = "quantity-picker mt-3";

            const label =
                document.createElement("div");
            label.className = "small mb-2";
            label.textContent = "Fuel tanks per booster";

            const controls =
                document.createElement("div");
            controls.className =
                "d-flex align-items-center justify-content-center gap-3";

            const minus =
                document.createElement("button");
            minus.type = "button";
            minus.className = "btn btn-outline-light";
            minus.textContent = "−";
            minus.disabled =
                rocket.boosterFuelTankCount <= 1;
            minus.addEventListener("click", () => {
                changeBoosterFuelTankCount(-1);
            });

            const quantity =
                document.createElement("strong");
            quantity.className = "fs-4";
            quantity.textContent =
                rocket.boosterFuelTankCount;

            const plus =
                document.createElement("button");
            plus.type = "button";
            plus.className = "btn btn-outline-light";
            plus.textContent = "+";
            plus.disabled =
                rocket.boosterFuelTankCount >= 20;
            plus.addEventListener("click", () => {
                changeBoosterFuelTankCount(1);
            });

            controls.append(minus, quantity, plus);

            const totalCost =
                document.createElement("p");
            totalCost.className =
                "small text-secondary mt-2 mb-0";
            totalCost.textContent =
                `Total cost: $${(
                    solidFuelTank.cost *
                    rocket.boosterFuelTankCount *
                    rocket.boosterCount
                ).toFixed(2)}M`;

            picker.append(label, controls, totalCost);
            fuelTankCard.appendChild(picker);
        }

        container.appendChild(fuelTankColumn);
    }
}


// ==================================================
// RADIO
// ==================================================

function renderRadios() {

    const container = document.getElementById("radioList");

    container.innerHTML = "";

    radios.forEach(radio => {

        const column = createCard(
            radio.name,
            [
                `Cost: $${radio.cost.toFixed(2)}M`,
                `Telemetry latency: ${radio.latency.toFixed(1)} seconds`
            ],
            rocket.radio?.name === radio.name
                ? "Selected"
                : "Select Radio",
            () => {

                saveHistory();

                rocket.radio = radio;

                renderAll();
            }
        );

        container.appendChild(column);
    });
}


// ==================================================
// COST AND MASS
// ==================================================

function getTotalCost() {

    let total = 0;

    rocket.stages.forEach(stage => {

        if (stage.engine) {

            total +=
                stage.engine.cost * stage.engine.quantity;
        }

        stage.tanks.forEach(tank => {
            total += tank.cost;
        });

        if (stage.decoupler) {
            total += stage.decoupler.cost;
        }
    });

    if (rocket.boosterEngine) {

        total +=
            rocket.boosterEngine.cost * rocket.boosterCount;
    }

    if (rocket.boosterFuelTank && rocket.boosterCount > 0) {
        total +=
            rocket.boosterFuelTank.cost *
            rocket.boosterFuelTankCount *
            rocket.boosterCount;
    }

    if (rocket.radio) {
        total += rocket.radio.cost;
    }

    return total;
}


function getTotalMass() {

    let total = PAYLOAD_MASS;

    rocket.stages.forEach(stage => {

        if (stage.engine) {

            total +=
                stage.engine.mass * stage.engine.quantity;
        }

        stage.tanks.forEach(tank => {

            total += tank.mass + tank.fuel;
        });

        if (stage.decoupler) {
            total += stage.decoupler.mass;
        }
    });

    if (rocket.boosterEngine) {

        total +=
            rocket.boosterEngine.mass * rocket.boosterCount;
    }

    if (rocket.boosterFuelTank && rocket.boosterCount > 0) {
        total +=
            (
                rocket.boosterFuelTank.mass +
                rocket.boosterFuelTank.fuel
            ) *
            rocket.boosterFuelTankCount *
            rocket.boosterCount;
    }

    return total;
}


// ==================================================
// PAD TWR
// ==================================================

function calculateTWR() {

    const firstStage = rocket.stages[0];

    if (!firstStage?.engine) return 0;

    let thrust =
        firstStage.engine.thrust *
        firstStage.engine.quantity *
        1000;

    if (rocket.boosterEngine) {

        thrust +=
            rocket.boosterEngine.thrust *
            rocket.boosterCount *
            1000;
    }

    const mass = getTotalMass();

    if (mass <= 0) return 0;

    return thrust / (mass * G0);
}


// ==================================================
// SIMULATED DELTA-V
// ==================================================

function calculateDeltaV() {

    let currentMass = getTotalMass();

    let totalDeltaV = 0;

    for (let index = 0; index < rocket.stages.length; index++) {
        const stage = rocket.stages[index];

        if (!stage.engine || stage.tanks.length === 0) {
            continue;
        }

        const engines = [{
            thrust:
                stage.engine.thrust *
                stage.engine.quantity *
                1000,
            isp: stage.engine.isp,
            fuel: stage.tanks.reduce(
                (sum, tank) => sum + tank.fuel,
                0
            )
        }];

        const boosterFuel =
            index === 0 &&
            rocket.boosterCount > 0 &&
            rocket.boosterEngine &&
            rocket.boosterFuelTank
                ? rocket.boosterFuelTank.fuel *
                    rocket.boosterFuelTankCount *
                    rocket.boosterCount
                : 0;

        if (boosterFuel > 0) {
            engines.push({
                thrust:
                    rocket.boosterEngine.thrust *
                    rocket.boosterCount *
                    1000,
                isp: rocket.boosterEngine.isp,
                fuel: boosterFuel
            });
        }

        while (engines.length > 0) {
            const active = engines.filter(
                engine =>
                    engine.fuel > 0 &&
                    engine.thrust > 0 &&
                    engine.isp > 0
            );

            if (active.length === 0) {
                break;
            }

            const totalThrust =
                active.reduce(
                    (sum, engine) => sum + engine.thrust,
                    0
                );

            const totalFlow =
                active.reduce(
                    (sum, engine) =>
                        sum + engine.thrust / (engine.isp * G0),
                    0
                );

            const burnDuration = Math.min(
                ...active.map(
                    engine =>
                        engine.fuel /
                        (engine.thrust / (engine.isp * G0))
                )
            );

            const massAfterBurn =
                currentMass - totalFlow * burnDuration;

            if (
                massAfterBurn <= 0 ||
                massAfterBurn >= currentMass
            ) {
                break;
            }

            totalDeltaV +=
                (totalThrust / totalFlow) *
                Math.log(currentMass / massAfterBurn);

            currentMass = massAfterBurn;

            for (const engine of active) {
                engine.fuel = Math.max(
                    0,
                    engine.fuel -
                    engine.thrust /
                        (engine.isp * G0) *
                        burnDuration
                );
            }

            for (let engineIndex = engines.length - 1; engineIndex >= 0; engineIndex--) {
                if (engines[engineIndex].fuel <= 0.000001) {
                    engines.splice(engineIndex, 1);
                }
            }
        }

        if (index < rocket.stages.length - 1 && stage.decoupler) {
            const stageDryMass =
                stage.engine.mass * stage.engine.quantity +
                stage.tanks.reduce(
                    (sum, tank) => sum + tank.mass,
                    0
                ) +
                stage.decoupler.mass;

            currentMass -= stageDryMass;

            if (index === 0 && rocket.boosterEngine) {
                currentMass -=
                    rocket.boosterEngine.mass *
                        rocket.boosterCount +
                    (rocket.boosterFuelTank?.mass ?? 0) *
                        rocket.boosterFuelTankCount *
                        rocket.boosterCount;
            }
        }
    }

    return Math.max(0, totalDeltaV);
}


// ==================================================
// TELEMETRY
// ==================================================

function updateMetrics() {

    const spent = getTotalCost();

    const twr = calculateTWR();

    const deltaV = calculateDeltaV();

    // Money is stored internally in millions.
    // Display money in billions.

    document.getElementById("spentAmount").textContent =
        (spent / 1000).toFixed(2);

    document.getElementById("idealDv").textContent =
        Math.round(deltaV).toLocaleString();

    document.getElementById("requiredDv").textContent =
        REQUIRED_DELTA_V.toLocaleString();

    document.getElementById("padTwr").textContent =
        twr.toFixed(2);


    // ==================================================
    // BUDGET
    // ==================================================

    const budgetBox =
        document.getElementById("budgetDisplay");

    budgetBox.classList.toggle(
        "over-budget",
        spent > BUDGET
    );

    document.getElementById("budgetStatus").textContent =
        spent > BUDGET
            ? "Budget exceeded"
            : `$${((BUDGET - spent) / 1000).toFixed(2)}B remaining`;


    // ==================================================
    // TWR
    // ==================================================

    const twrBox =
        document.getElementById("twrDisplay");

    twrBox.classList.toggle(
        "twr-valid",
        twr >= MIN_TWR &&
        twr < MAX_TWR
    );

    twrBox.classList.toggle(
        "twr-invalid",
        twr < MIN_TWR ||
        twr >= MAX_TWR
    );

    document.getElementById("twrStatus").textContent =
        twr < MIN_TWR
            ? `Minimum required: ${MIN_TWR.toFixed(2)}`
            : twr >= MAX_TWR
                ? `Maximum launch TWR: ${MAX_TWR.toFixed(2)}`
                : "Pad TWR within launch limits";
}


// ==================================================
// PROCEED VALIDATION
// ==================================================

function updateProceed() {

    const validation = validateBuild();

    const spent = getTotalCost();

    const twr = calculateTWR();

    const boostersValid =
        rocket.boosterCount === 0 ||
        (
            rocket.boosterEngine !== null &&
            rocket.boosterFuelTank !== null
        );

    const budgetValid =
        spent <= BUDGET;

    const twrValid =
        twr >= MIN_TWR &&
        twr < MAX_TWR;

    const canProceed =
        validation.valid &&
        boostersValid &&
        budgetValid &&
        twrValid;

    const button =
        document.getElementById("proceedBtn");

    button.disabled = !canProceed;

    const status =
        document.getElementById("assemblyStatus");


    if (!validation.valid) {

        status.className =
            "alert alert-secondary";

        status.textContent =
            validation.reason;

    } else if (!boostersValid) {

        status.className =
            "alert alert-warning";

        status.textContent =
            "Select a booster engine and solid fuel tank.";

    } else if (!budgetValid) {

        status.className =
            "alert alert-danger";

        status.textContent =
            "Your vehicle exceeds the $4.00B budget.";

    } else if (!twrValid) {

        status.className =
            "alert alert-warning";

        status.textContent =
            twr < MIN_TWR
                ? `Pad TWR must be at least ${MIN_TWR.toFixed(2)}.`
                : `Pad TWR must be below ${MAX_TWR.toFixed(2)}.`;

    } else {

        status.className =
            "alert alert-success";

        status.textContent =
            "All stages validated. Ready for launch window selection.";
    }
}


// ==================================================
// RENDER EVERYTHING
// ==================================================

function renderAll() {

    renderCatalog("engine");

    renderCatalog("tank");

    renderCatalog("decoupler");

    renderBoosters();

    renderRadios();

    renderManifest();

    updateMetrics();

    updateProceed();
}


// ==================================================
// INITIALIZATION
// ==================================================

document.addEventListener("DOMContentLoaded", () => {


    // ==================================================
    // AGENCY TITLE
    // ==================================================

    updateAgencyTitle();


    // ==================================================
    // RELOAD / LEAVE WARNING
    // ==================================================

    window.addEventListener("beforeunload", function (event) {

        if (!hasUnsavedChanges) return;

        event.preventDefault();

        event.returnValue = "";
    });


    // ==================================================
    // BOOSTER COUNT BUTTONS
    // ==================================================

    document.querySelectorAll("#boosterCount button").forEach(button => {

        button.addEventListener("click", () => {

            selectBoosterCount(
                Number(button.dataset.count)
            );
        });
    });


    // ==================================================
    // UNDO
    // ==================================================

    document.getElementById("undoBtn").addEventListener(
        "click",
        undoAction
    );


    // ==================================================
    // RESET
    // ==================================================

    document.getElementById("resetBtn").addEventListener(
        "click",
        resetAssembly
    );


    // ==================================================
    // PROCEED
    // ==================================================

    document.getElementById("proceedBtn").addEventListener(
        "click",
        () => {

            const validation = validateBuild();

            const twr =
                calculateTWR();

            if (
                !validation.valid ||
                getTotalCost() > BUDGET ||
                twr < MIN_TWR ||
                twr >= MAX_TWR ||
                (
                    rocket.boosterCount > 0 &&
                    (
                        !rocket.boosterEngine ||
                        !rocket.boosterFuelTank
                    )
                )
            ) return;


            const finalRocket = {

                ...rocket,

                metrics: {

                    budget:
                        getTotalCost(),

                    padTwr:
                        twr,

                    idealDv:
                        calculateDeltaV()
                }
            };


            localStorage.setItem(
                "rocket",
                JSON.stringify(finalRocket)
            );


            // Assembly successfully saved.
            // Do not show the unsaved-changes warning.

            hasUnsavedChanges = false;


            window.location.href = "/window";
        }
    );


    // ==================================================
    // INITIAL RENDERING
    // ==================================================

    renderAll();

});