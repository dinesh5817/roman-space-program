/* =========================================================
   ROMAN SPACE PROGRAM
   FLIGHT OPERATIONS - 2D ASCENT

   Simplified 2D Cartesian game simulation.
   Does not calculate real orbital mechanics.
========================================================= */

/* =========================================================
   1. PHYSICAL CONSTANTS
========================================================= */

const G0 = 9.80665;

const EARTH_RADIUS = 6371000;
const EARTH_MU = 3.986004418e14;

const PAYLOAD_MASS = 5000;

const LEO_NET_DELTA_V_TARGET = 7800;
const L2_INSERTION_DELTA_V_REQUIRED = 3200;

const RESULT_PAGE_URL = "/result";

const SEA_LEVEL_DENSITY = 1.225;
const ATMOSPHERE_SCALE_HEIGHT = 8500;

const DRAG_COEFFICIENT = 0.30;
const REFERENCE_AREA = 10;

const MAX_SIMULATION_TIME = 1800;

const FIXED_PHYSICS_STEP = 0.02;
const MAX_CATCH_UP_STEPS_PER_FRAME = 500;

const LEO_DISPLAY_ALTITUDE = 200000;


/* =========================================================
   1A. LAUNCH SEQUENCE
========================================================= */

const LAUNCH_COUNTDOWN_DURATION = 60;
const LAUNCH_AUTHORIZATION_GATE = 33;
const LAUNCH_HOLD_DURATION = 30;


/* =========================================================
   2. LIFTOFF ACCELERATION LIMITER
========================================================= */

const LIFTOFF_ACCELERATION_START = 0.25;
const LIFTOFF_ACCELERATION_RAMP_RATE = 0.12;
const LIFTOFF_ACCELERATION_MAX = 3.0;

const LIFTOFF_HOLD_DURATION = 8;

const ACCELERATION_LIMIT_RELEASE_RATE = 0.6;

const MAX_ALLOWED_ACCELERATION = 20;


function calculateAccelerationLimit(missionTime) {
    const rampDuration =
        (
            LIFTOFF_ACCELERATION_MAX -
            LIFTOFF_ACCELERATION_START
        ) / LIFTOFF_ACCELERATION_RAMP_RATE;

    const rampLimit = Math.min(
        LIFTOFF_ACCELERATION_MAX,
        LIFTOFF_ACCELERATION_START +
        LIFTOFF_ACCELERATION_RAMP_RATE * missionTime
    );

    if (missionTime <= rampDuration) {
        return rampLimit;
    }

    const timeAfterRamp =
        missionTime - rampDuration;

    if (timeAfterRamp <= LIFTOFF_HOLD_DURATION) {
        return LIFTOFF_ACCELERATION_MAX;
    }

    return Math.min(
        MAX_ALLOWED_ACCELERATION,
        LIFTOFF_ACCELERATION_MAX +
        (
            timeAfterRamp - LIFTOFF_HOLD_DURATION
        ) * ACCELERATION_LIMIT_RELEASE_RATE
    );
}


/* =========================================================
   3. STATE-DEPENDENT GUIDANCE PARAMETERS
========================================================= */

const GUIDANCE_TARGET_ALTITUDE = 150000;
const GUIDANCE_TARGET_HORIZONTAL_SPEED = 7200;
const GUIDANCE_TARGET_TOTAL_SPEED = 7800;

const GUIDANCE_INITIAL_VERTICAL_SPEED = 250;

const GUIDANCE_MAX_PITCH = 85;
const GUIDANCE_MIN_PITCH = 0;

const GUIDANCE_MAX_PITCH_RATE = 8;
const GUIDANCE_RESPONSE_RATE = 1.8;

const GUIDANCE_HORIZONTAL_ERROR_SCALE = 2500;
const GUIDANCE_VERTICAL_ERROR_SCALE = 1800;

const GUIDANCE_MINIMUM_CONTROL_SPEED = 100;


/* =========================================================
   3A. VERTICAL ASCENT PROTECTION
========================================================= */

/*
   The vehicle must retain enough vertical thrust to
   counter gravity and maintain a positive vertical ascent.

   A small support margin is maintained rather than
   allowing guidance to pitch over at the exact TWR limit.
*/

const VERTICAL_SUPPORT_MARGIN = 1.05;

const VERTICAL_VELOCITY_RECOVERY_THRESHOLD = 500;

const VERTICAL_VELOCITY_CRITICAL_THRESHOLD = 150;

const VERTICAL_ACCELERATION_RECOVERY_THRESHOLD = -0.5;

const VERTICAL_RECOVERY_PITCH_LIMIT = 15;

const VERTICAL_RECOVERY_RESPONSE_MULTIPLIER = 2.0;


/* =========================================================
   3B. LEO MISSION COMPLETION CONDITIONS
========================================================= */

const LEO_MIN_HORIZONTAL_SPEED =
    GUIDANCE_TARGET_HORIZONTAL_SPEED;

const LEO_MAX_VERTICAL_SPEED = 1000;


/* =========================================================
   4. MAX Q GAMEPLAY LIMITS
========================================================= */

const MAX_Q_CAUTION = 45000;
const MAX_Q_SEVERE = 65000;
const MAX_Q_FAILURE = 80000;

const MAX_Q_DISTURBANCE_BIAS = 12;
const MAX_Q_DISTURBANCE_OSCILLATION = 5;

const MAX_Q_DISTURBANCE_FREQUENCY = 2.4;

const MAX_Q_TWR_LIMIT = 1.50;

const MAX_Q_TWR_BACKLASH_START = 1.50;
const MAX_Q_TWR_BACKLASH_FULL = 2.00;

const MAX_Q_TWR_DISTURBANCE_MULTIPLIER = 1.75;


/* =========================================================
   5. TELEMETRY CONSTANTS
========================================================= */

const TELEMETRY_MAX = {
    velocity: 10000,
    altitude: 200000,
    thrust: 10000
};

const GAUGE_RADIUS = 68;

const GAUGE_CIRCUMFERENCE =
    2 * Math.PI * GAUGE_RADIUS;


/* =========================================================
   6. GENERAL HELPERS
========================================================= */

function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return "0";
    }

    return Math.round(value).toLocaleString("en-US");
}


function formatMissionTime(seconds) {
    const total = Math.max(
        0,
        Math.floor(seconds)
    );

    const hours = Math.floor(total / 3600);

    const minutes = Math.floor(
        (total % 3600) / 60
    );

    const remaining = total % 60;

    return [hours, minutes, remaining]
        .map(value =>
            String(value).padStart(2, "0")
        )
        .join(":");
}


function clamp(value, minimum, maximum) {
    return Math.max(
        minimum,
        Math.min(maximum, value)
    );
}


function smoothstep(value) {
    const x = clamp(value, 0, 1);

    return x * x * (3 - 2 * x);
}


function isValidNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
}


function calculateTotalSpeed(horizontal, vertical) {
    return Math.hypot(horizontal, vertical);
}


function degreesToRadians(degrees) {
    return degrees * Math.PI / 180;
}


function radiansToDegrees(radians) {
    return radians * 180 / Math.PI;
}


function moveTowards(current, target, maximumChange) {
    if (current < target) {
        return Math.min(
            current + maximumChange,
            target
        );
    }

    return Math.max(
        current - maximumChange,
        target
    );
}


/* =========================================================
   7. VEHICLE CONFIGURATION
========================================================= */

function buildVehicleConfiguration(rocket) {
    if (
        !rocket ||
        !Array.isArray(rocket.stages) ||
        rocket.stages.length === 0
    ) {
        return null;
    }

    const rawBoosterCount =
        Number(rocket.boosterCount ?? 0);

    if (
        !Number.isFinite(rawBoosterCount) ||
        rawBoosterCount < 0
    ) {
        return null;
    }

    const boosterCount =
        Math.floor(rawBoosterCount);

    const boosterEngine =
        rocket.boosterEngine || null;

    if (boosterCount > 0 && !boosterEngine) {
        return null;
    }

    const boosterMass =
        boosterEngine && boosterCount > 0
            ? Number(boosterEngine.mass ?? 0) *
                boosterCount
            : 0;

    const boosterThrust =
        boosterEngine && boosterCount > 0
            ? Number(boosterEngine.thrust ?? 0) *
                boosterCount * 1000
            : 0;

    const boosterFuel =
        boosterEngine && boosterCount > 0
            ? Number(
                boosterEngine.fuel ??
                boosterEngine.fuelMass ??
                0
            )
            : 0;

    const boosterISP =
        boosterEngine
            ? Number(boosterEngine.isp ?? 0)
            : 0;

    const stages = rocket.stages.map(
        (stage, index) => {
            if (
                !stage ||
                !stage.engine ||
                !Array.isArray(stage.tanks)
            ) {
                return null;
            }

            const engine = stage.engine;

            const quantityValue =
                Number(engine.quantity ?? 1);

            if (
                !Number.isFinite(quantityValue) ||
                quantityValue < 1 ||
                !Number.isInteger(quantityValue)
            ) {
                return null;
            }

            const quantity = quantityValue;

            const engineMass =
                Number(engine.mass ?? 0) * quantity;

            const engineThrust =
                Number(engine.thrust ?? 0) *
                quantity * 1000;

            const engineISP =
                Number(engine.isp ?? 0);

            let tankDryMass = 0;
            let fuel = 0;

            for (const tank of stage.tanks) {
                if (!tank) {
                    return null;
                }

                const tankMass =
                    Number(tank.mass ?? 0);

                const tankFuel =
                    Number(tank.fuel ?? 0);

                if (
                    !isValidNonNegative(tankMass) ||
                    !isValidNonNegative(tankFuel)
                ) {
                    return null;
                }

                tankDryMass += tankMass;
                fuel += tankFuel;
            }

            const decouplerMass =
                Number(stage.decoupler?.mass ?? 0);

            const dryMass =
                engineMass +
                tankDryMass +
                decouplerMass +
                (index === 0 ? boosterMass : 0);

            const values = [
                engineMass,
                engineThrust,
                engineISP,
                tankDryMass,
                fuel,
                decouplerMass,
                dryMass
            ];

            if (
                values.some(
                    value =>
                        !isValidNonNegative(value)
                ) ||
                engineThrust <= 0 ||
                engineISP <= 0
            ) {
                return null;
            }

            return {
                engine:
                    engine.name ||
                    `Stage ${index + 1}`,

                thrust: engineThrust,

                isp: engineISP,

                dryMass,

                fuelRemaining: fuel,

                hasDecoupler:
                    Boolean(stage.decoupler)
            };
        }
    );

    if (stages.some(stage => stage === null)) {
        return null;
    }

    if (
        ![
            boosterMass,
            boosterThrust,
            boosterFuel,
            boosterISP
        ].every(isValidNonNegative)
    ) {
        return null;
    }

    if (
        boosterCount > 0 &&
        (
            boosterThrust <= 0 ||
            boosterISP <= 0
        )
    ) {
        return null;
    }

    const totalMass =
        PAYLOAD_MASS +
        stages.reduce(
            (sum, stage) =>
                sum +
                stage.dryMass +
                stage.fuelRemaining,
            0
        ) +
        boosterFuel;

    const radioLatency =
        Number(rocket.radio?.latency ?? 1.5);

    if (
        !Number.isFinite(radioLatency) ||
        radioLatency < 0
    ) {
        return null;
    }

    if (
        !Number.isFinite(totalMass) ||
        totalMass <= PAYLOAD_MASS
    ) {
        return null;
    }

    return {
        stages,

        totalMass,

        radioLatency,

        booster: {
            mass: boosterMass,
            thrust: boosterThrust,
            isp: boosterISP,
            fuelRemaining: boosterFuel
        },

        maxThrust:
            Math.max(
                ...stages.map(stage => stage.thrust)
            ) + boosterThrust
    };
}


/* =========================================================
   8. GLOBAL VEHICLE AND FLIGHT STATE
========================================================= */

let vehicle = null;

let vehicleStages = [];

let radioLatency = 1.5;

let deltaVMaximum = 0;

let pendingCommands = [];

let lastCommandMessage = "Awaiting command";

let boosterFuelRemaining = 0;

let lastPhysicsTime = null;

let physicsAccumulator = 0;

let resultShown = false;


let launchSequence = {
    phase: "COUNTDOWN",
    elapsed: 0,
    holdElapsed: 0,
    goReceived: false
};


const flightState = {
    time: 0,

    altitude: 0,

    horizontalPosition: 0,

    verticalVelocity: 0,

    horizontalVelocity: 0,

    speed: 0,

    acceleration: 0,

    verticalAcceleration: 0,

    horizontalAcceleration: 0,

    mass: 0,

    fuel: 0,

    thrust: 0,

    throttle: 1,

    stage: 1,

    stageIndex: 0,

    stageArmed: false,

    pitch: 0,

    commandedPitch: 0,

    pitchDeviation: 0,

    maxQDisturbance: 0,

    deltaVRemaining: 0,

    leoDeltaVRemaining:
        LEO_NET_DELTA_V_TARGET,

    engineDeltaVUsed: 0,

    gravityLoss: 0,

    dragLoss: 0,

    twr: 0,

    dynamicPressure: 0,

    dragForce: 0,

    maxQ: 0,

    maxQReached: false,

    previousQ: 0,

    maxAltitude: 0,

    groundImpact: false,

    communicationLost: false,

    over: false,

    result: null
};


/* =========================================================
   9. LAUNCH SEQUENCE UI
========================================================= */

function createLaunchSequenceUI() {
    const controlsPanel =
        document.getElementById("controls-panel");

    if (!controlsPanel) {
        console.error(
            "Launch sequence UI could not be created: " +
            "#controls-panel was not found."
        );

        return;
    }

    if (
        document.getElementById("launch-sequence-panel")
    ) {
        return;
    }

    const panel = document.createElement("div");

    panel.id = "launch-sequence-panel";

    panel.className =
        "launch-sequence text-center p-4 mb-4";

    panel.style.border = "1px solid rgba(0, 200, 255, 0.35)";
    panel.style.borderRadius = "12px";
    panel.style.background = "rgba(0, 20, 35, 0.65)";

    panel.innerHTML = `
        <p class="telemetry-label mb-2">
            LAUNCH OPERATIONS
        </p>

        <h2
            id="launch-countdown"
            class="display-4 fw-bold text-info"
        >
            T-00:01:00
        </h2>

        <p
            id="launch-sequence-status"
            class="text-light mb-3"
        >
            AWAITING GO FOR LAUNCH
        </p>

        <button
            type="button"
            id="goForLaunch"
            class="btn btn-success btn-lg"
        >
            GO FOR LAUNCH
        </button>
    `;

    controlsPanel.prepend(panel);

    document.getElementById("goForLaunch")
        ?.addEventListener(
            "click",
            giveGoForLaunch
        );
}


function formatLaunchCountdown(seconds) {
    const total = Math.max(
        0,
        Math.ceil(seconds)
    );

    const minutes = Math.floor(total / 60);

    const remaining = total % 60;

    return (
        `T-${String(minutes).padStart(2, "0")}:` +
        `${String(remaining).padStart(2, "0")}`
    );
}


function updateLaunchDisplay() {
    const countdown =
        document.getElementById("launch-countdown");

    const status =
        document.getElementById(
            "launch-sequence-status"
        );

    const button =
        document.getElementById("goForLaunch");

    if (!countdown || !status || !button) {
        return;
    }

    button.disabled = false;

    switch (launchSequence.phase) {
        case "COUNTDOWN": {
            const remaining =
                LAUNCH_COUNTDOWN_DURATION -
                launchSequence.elapsed;

            countdown.textContent =
                formatLaunchCountdown(remaining);

            if (launchSequence.goReceived) {
                status.textContent =
                    "GO FOR LAUNCH AUTHORIZED";

                button.textContent =
                    "LAUNCH AUTHORIZED";

                button.disabled = true;

            } else {
                status.textContent =
                    "AWAITING GO FOR LAUNCH";

                button.textContent =
                    "GO FOR LAUNCH";
            }

            break;
        }

        case "HOLD": {
            const holdRemaining =
                Math.max(
                    0,
                    LAUNCH_HOLD_DURATION -
                    launchSequence.holdElapsed
                );

            countdown.textContent = "T-00:33";

            status.textContent =
                `HOLD: AWAITING GO FOR LAUNCH ` +
                `(${Math.ceil(holdRemaining)}s REMAINING)`;

            button.textContent =
                "GO FOR LAUNCH";

            break;
        }

        case "FLIGHT":
            countdown.textContent =
                "T+00:00:00";

            status.textContent =
                "LIFTOFF: FLIGHT SEQUENCE ACTIVE";

            button.textContent =
                "LAUNCH INITIATED";

            button.disabled = true;

            break;

        case "ABORTED":
            countdown.textContent =
                "LAUNCH ABORTED";

            status.textContent =
                "MISSION ABORTED: NO LAUNCH AUTHORIZATION";

            button.textContent =
                "MISSION ABORTED";

            button.disabled = true;

            break;
    }
}


/* =========================================================
   9A. GO FOR LAUNCH AUTHORIZATION
========================================================= */

function giveGoForLaunch() {
    if (
        flightState.over ||
        launchSequence.phase === "FLIGHT" ||
        launchSequence.phase === "ABORTED" ||
        launchSequence.goReceived
    ) {
        return;
    }

    launchSequence.goReceived = true;

    if (launchSequence.phase === "HOLD") {
        launchSequence.phase = "COUNTDOWN";

        launchSequence.elapsed =
            LAUNCH_COUNTDOWN_DURATION -
            LAUNCH_AUTHORIZATION_GATE;

        launchSequence.holdElapsed = 0;

        lastPhysicsTime = null;

        physicsAccumulator = 0;
    }

    updateLaunchDisplay();
}


/* =========================================================
   9B. LAUNCH ABORT
========================================================= */

function abortLaunchSequence() {
    if (
        flightState.over ||
        launchSequence.phase === "ABORTED"
    ) {
        return;
    }

    launchSequence.phase = "ABORTED";

    flightState.over = true;

    flightState.result = "intentional-abort";

    pendingCommands = [];

    lastCommandMessage =
        "LAUNCH ABORTED: GO FOR LAUNCH NOT RECEIVED";

    updateLaunchDisplay();

    showResult();
}


/* =========================================================
   9C. COUNTDOWN AND HOLD TIMING
========================================================= */

function updateLaunchSequence(realElapsed) {
    if (
        launchSequence.phase === "FLIGHT" ||
        launchSequence.phase === "ABORTED"
    ) {
        return;
    }

    if (launchSequence.phase === "COUNTDOWN") {
        launchSequence.elapsed += realElapsed;

        const authorizationGate =
            LAUNCH_COUNTDOWN_DURATION -
            LAUNCH_AUTHORIZATION_GATE;

        if (
            launchSequence.elapsed >= authorizationGate &&
            !launchSequence.goReceived
        ) {
            launchSequence.elapsed =
                authorizationGate;

            launchSequence.phase = "HOLD";

            launchSequence.holdElapsed = 0;

            updateLaunchDisplay();

            return;
        }

        if (
            launchSequence.elapsed >=
            LAUNCH_COUNTDOWN_DURATION
        ) {
            launchSequence.elapsed =
                LAUNCH_COUNTDOWN_DURATION;

            launchSequence.phase = "FLIGHT";

            physicsAccumulator = 0;

            lastPhysicsTime = null;

            updateLaunchDisplay();

            return;
        }
    }

    else if (launchSequence.phase === "HOLD") {
        launchSequence.holdElapsed += realElapsed;

        if (
            launchSequence.holdElapsed >=
            LAUNCH_HOLD_DURATION
        ) {
            launchSequence.holdElapsed =
                LAUNCH_HOLD_DURATION;

            abortLaunchSequence();

            return;
        }
    }

    updateLaunchDisplay();
}


/* =========================================================
   10. STAGE AND PROPULSION HELPERS
========================================================= */

function getCurrentStage() {
    return (
        vehicleStages[flightState.stageIndex] ||
        null
    );
}


function getCurrentThrust() {
    const stage = getCurrentStage();

    const coreThrust =
        stage && stage.fuelRemaining > 0
            ? stage.thrust * flightState.throttle
            : 0;

    const boosterThrust =
        flightState.stageIndex === 0 &&
        boosterFuelRemaining > 0 &&
        vehicle?.booster
            ? vehicle.booster.thrust *
                flightState.throttle
            : 0;

    return coreThrust + boosterThrust;
}


function canArmNextStage() {
    const stage = getCurrentStage();

    const nextStageExists =
        flightState.stageIndex <
        vehicleStages.length - 1;

    return Boolean(
        stage &&
        stage.hasDecoupler &&
        nextStageExists
    );
}


function calculateFuelFlow(thrust, isp) {
    if (thrust <= 0 || isp <= 0) {
        return 0;
    }

    return thrust / (isp * G0);
}


function calculateTotalRemainingFuel() {
    let total = boosterFuelRemaining;

    for (
        let index = flightState.stageIndex;
        index < vehicleStages.length;
        index++
    ) {
        total += Math.max(
            0,
            vehicleStages[index].fuelRemaining
        );
    }

    return total;
}


function calculateVehicleMass() {
    let mass = PAYLOAD_MASS;

    for (
        let index = flightState.stageIndex;
        index < vehicleStages.length;
        index++
    ) {
        const stage = vehicleStages[index];

        mass +=
            stage.dryMass +
            stage.fuelRemaining;
    }

    return mass + boosterFuelRemaining;
}


/* =========================================================
   11. ENVIRONMENT
========================================================= */

function calculateGravity(altitude) {
    const radius =
        EARTH_RADIUS + Math.max(0, altitude);

    return EARTH_MU / (radius * radius);
}


function calculateAtmosphericDensity(altitude) {
    const h = Math.max(0, altitude);

    return SEA_LEVEL_DENSITY *
        Math.exp(-h / ATMOSPHERE_SCALE_HEIGHT);
}


function calculateDynamicPressure(altitude, speed) {
    return (
        0.5 *
        calculateAtmosphericDensity(altitude) *
        speed *
        speed
    );
}


function calculateDrag(altitude, speed) {
    return (
        calculateDynamicPressure(
            altitude,
            speed
        ) *
        DRAG_COEFFICIENT *
        REFERENCE_AREA
    );
}


function calculateTWR() {
    if (flightState.mass <= 0) {
        return 0;
    }

    const weight =
        flightState.mass *
        calculateGravity(flightState.altitude);

    return weight > 0
        ? getCurrentThrust() / weight
        : 0;
}


/* =========================================================
   12. STATE-DEPENDENT PITCH GUIDANCE
========================================================= */

function calculateCommandedPitch() {
    const s = flightState;

    const altitudeProgress = smoothstep(
        s.altitude /
        GUIDANCE_TARGET_ALTITUDE
    );

    const speedProgress = smoothstep(
        s.speed /
        GUIDANCE_TARGET_TOTAL_SPEED
    );

    const horizontalTargetShare =
        altitudeProgress *
        speedProgress;

    const desiredHorizontalVelocity =
        GUIDANCE_TARGET_HORIZONTAL_SPEED *
        horizontalTargetShare;

    const desiredVerticalVelocity =
        GUIDANCE_INITIAL_VERTICAL_SPEED *
            (1 - altitudeProgress) +
        900 *
            altitudeProgress;

    const horizontalError =
        (
            desiredHorizontalVelocity -
            s.horizontalVelocity
        ) / GUIDANCE_HORIZONTAL_ERROR_SCALE;

    const verticalError =
        (
            desiredVerticalVelocity -
            s.verticalVelocity
        ) / GUIDANCE_VERTICAL_ERROR_SCALE;

    const horizontalDemand =
        clamp(horizontalError, -1, 1);

    const verticalDemand =
        clamp(verticalError, -1, 1);

    const altitudeBias =
        altitudeProgress * 0.35;

    const rawHorizontalShare =
        clamp(
            0.5 +
            horizontalDemand * 0.38 -
            verticalDemand * 0.22 +
            altitudeBias,
            0,
            0.98
        );

    const desiredPitch =
        radiansToDegrees(
            Math.asin(rawHorizontalShare)
        );

    return clamp(
        desiredPitch,
        GUIDANCE_MIN_PITCH,
        GUIDANCE_MAX_PITCH
    );
}


function calculateMaxQDisturbance() {
    const q = flightState.dynamicPressure;

    if (q <= MAX_Q_CAUTION) {
        return 0;
    }

    const severity = clamp(
        (
            q - MAX_Q_CAUTION
        ) / (
            MAX_Q_SEVERE -
            MAX_Q_CAUTION
        ),
        0,
        1
    );

    const baseBias =
        MAX_Q_DISTURBANCE_BIAS *
        severity;

    const baseOscillation =
        Math.sin(
            flightState.time *
            MAX_Q_DISTURBANCE_FREQUENCY
        ) *
        MAX_Q_DISTURBANCE_OSCILLATION *
        severity;

    const twrBacklash =
        clamp(
            (
                flightState.twr -
                MAX_Q_TWR_BACKLASH_START
            ) / (
                MAX_Q_TWR_BACKLASH_FULL -
                MAX_Q_TWR_BACKLASH_START
            ),
            0,
            1
        );

    const disturbanceMultiplier =
        1 +
        twrBacklash *
        (
            MAX_Q_TWR_DISTURBANCE_MULTIPLIER -
            1
        );

    return (
        baseBias +
        baseOscillation
    ) * disturbanceMultiplier;
}


/* =========================================================
   12A. VERTICAL SUPPORT PITCH LIMIT
========================================================= */

/*
   TWR is total thrust divided by vehicle weight.

   Vertical thrust is:

       T_vertical = T * cos(pitch)

   Therefore:

       Vertical TWR = TWR * cos(pitch)

   When the vehicle has insufficient vertical support,
   the permitted pitch angle is reduced.

   This prevents guidance from continuing to pitch
   horizontally when the available thrust cannot sustain
   the vertical component of the ascent.
*/

function calculateVerticalSupportPitchLimit(currentTWR) {
    if (
        !Number.isFinite(currentTWR) ||
        currentTWR <= 0
    ) {
        return GUIDANCE_MIN_PITCH;
    }

    if (currentTWR <= VERTICAL_SUPPORT_MARGIN) {
        return GUIDANCE_MIN_PITCH;
    }

    const requiredVerticalShare =
        VERTICAL_SUPPORT_MARGIN / currentTWR;

    const maximumPitchRadians =
        Math.acos(
            clamp(
                requiredVerticalShare,
                0,
                1
            )
        );

    return clamp(
        radiansToDegrees(maximumPitchRadians),
        GUIDANCE_MIN_PITCH,
        GUIDANCE_MAX_PITCH
    );
}


/* =========================================================
   12B. REVISED PITCH GUIDANCE
========================================================= */

function updatePitchGuidance(dt) {
    const s = flightState;

    const targetPitch =
        calculateCommandedPitch();

    s.commandedPitch = targetPitch;

    const currentTWR =
        calculateTWR();

    const disturbance =
        calculateMaxQDisturbance();

    s.maxQDisturbance = disturbance;

    /*
       Start with normal guidance plus Max Q disturbance.
    */

    let finalTargetPitch =
        clamp(
            targetPitch + disturbance,
            GUIDANCE_MIN_PITCH,
            GUIDANCE_MAX_PITCH
        );

    /*
       Apply vertical thrust support limit.

       If TWR is low, the rocket must remain closer
       to vertical to retain enough vertical thrust.
    */

    const supportPitchLimit =
        calculateVerticalSupportPitchLimit(
            currentTWR
        );

    finalTargetPitch = Math.min(
        finalTargetPitch,
        supportPitchLimit
    );

    /*
       Recovery mode.

       If vertical velocity is low or vertical
       acceleration is strongly negative, reduce
       pitch aggressively.

       This is different from the previous implementation,
       which merely stopped further pitch increases.
    */

    const verticalVelocityLow =
        s.verticalVelocity <
        VERTICAL_VELOCITY_RECOVERY_THRESHOLD;

    const verticalVelocityCritical =
        s.verticalVelocity <
        VERTICAL_VELOCITY_CRITICAL_THRESHOLD;

    const verticalAccelerationCritical =
        s.verticalAcceleration <
        VERTICAL_ACCELERATION_RECOVERY_THRESHOLD;

    if (
        verticalVelocityLow ||
        verticalVelocityCritical ||
        verticalAccelerationCritical
    ) {
        finalTargetPitch = Math.min(
            finalTargetPitch,
            VERTICAL_RECOVERY_PITCH_LIMIT
        );
    }

    /*
       If the rocket is already descending, command
       the most vertical possible attitude.

       This cannot create thrust that the vehicle does
       not have, but it avoids wasting available thrust
       on horizontal acceleration during recovery.
    */

    if (s.verticalVelocity < 0) {
        finalTargetPitch = GUIDANCE_MIN_PITCH;
    }

    /*
       Apply a faster response when recovering.
    */

    const recovering =
        verticalVelocityLow ||
        verticalAccelerationCritical ||
        s.verticalVelocity < 0;

    const responseMultiplier =
        recovering
            ? VERTICAL_RECOVERY_RESPONSE_MULTIPLIER
            : 1;

    const maximumChange =
        GUIDANCE_MAX_PITCH_RATE *
        responseMultiplier *
        dt;

    const responsivePitch =
        moveTowards(
            s.pitch,
            finalTargetPitch,
            maximumChange
        );

    const responseFactor =
        clamp(
            GUIDANCE_RESPONSE_RATE *
            responseMultiplier *
            dt,
            0,
            1
        );

    s.pitch +=
        (
            responsivePitch -
            s.pitch
        ) * responseFactor;

    s.pitch = clamp(
        s.pitch,
        GUIDANCE_MIN_PITCH,
        GUIDANCE_MAX_PITCH
    );

    s.pitchDeviation =
        Math.max(
            0,
            s.pitch - s.commandedPitch
        );
}


/* =========================================================
   13. REMAINING IDEAL DELTA-V
========================================================= */

function calculateRemainingDeltaV() {
    if (
        !vehicle ||
        vehicleStages.length === 0
    ) {
        return 0;
    }

    let remainingMass =
        calculateVehicleMass();

    let totalDeltaV = 0;

    for (
        let index = flightState.stageIndex;
        index < vehicleStages.length;
        index++
    ) {
        const stage = vehicleStages[index];

        const engines = [];

        if (stage.fuelRemaining > 0) {
            engines.push({
                thrust: stage.thrust,
                isp: stage.isp,
                fuel: stage.fuelRemaining
            });
        }

        if (
            index === 0 &&
            boosterFuelRemaining > 0 &&
            vehicle.booster?.thrust > 0
        ) {
            engines.push({
                thrust: vehicle.booster.thrust,
                isp: vehicle.booster.isp,
                fuel: boosterFuelRemaining
            });
        }

        while (engines.length > 0) {
            const active = engines.filter(
                engine =>
                    engine.fuel > 0 &&
                    engine.thrust > 0
            );

            if (active.length === 0) {
                break;
            }

            const totalThrust =
                active.reduce(
                    (sum, engine) =>
                        sum + engine.thrust,
                    0
                );

            const totalFlow =
                active.reduce(
                    (sum, engine) =>
                        sum +
                        calculateFuelFlow(
                            engine.thrust,
                            engine.isp
                        ),
                    0
                );

            if (
                totalThrust <= 0 ||
                totalFlow <= 0
            ) {
                break;
            }

            const burnDuration = Math.min(
                ...active.map(engine =>
                    engine.fuel /
                    calculateFuelFlow(
                        engine.thrust,
                        engine.isp
                    )
                )
            );

            const consumed =
                totalFlow * burnDuration;

            const massAfterBurn =
                remainingMass - consumed;

            if (
                massAfterBurn <= 0 ||
                massAfterBurn >= remainingMass
            ) {
                break;
            }

            const effectiveExhaustVelocity =
                totalThrust / totalFlow;

            totalDeltaV +=
                effectiveExhaustVelocity *
                Math.log(
                    remainingMass / massAfterBurn
                );

            remainingMass = massAfterBurn;

            for (const engine of active) {
                engine.fuel = Math.max(
                    0,
                    engine.fuel -
                    calculateFuelFlow(
                        engine.thrust,
                        engine.isp
                    ) * burnDuration
                );
            }

            for (
                let i = engines.length - 1;
                i >= 0;
                i--
            ) {
                if (
                    engines[i].fuel <= 0.000001
                ) {
                    engines.splice(i, 1);
                }
            }
        }

        if (index < vehicleStages.length - 1) {
            if (stage.hasDecoupler) {
                remainingMass -= stage.dryMass;
            } else {
                break;
            }
        }
    }

    return Math.max(0, totalDeltaV);
}


/* =========================================================
   14. USEFUL DELTA-V AND LEO CHECK
========================================================= */

function calculateUsefulDeltaV() {
    return (
        flightState.engineDeltaVUsed -
        flightState.gravityLoss -
        flightState.dragLoss
    );
}


function calculateLEODeltaVRemaining() {
    return Math.max(
        0,
        LEO_NET_DELTA_V_TARGET -
        calculateUsefulDeltaV()
    );
}


function hasReachedLEOThreshold() {
    const s = flightState;

    const altitudeReached =
        s.altitude >= LEO_DISPLAY_ALTITUDE;

    const horizontalSpeedReached =
        s.horizontalVelocity >=
        LEO_MIN_HORIZONTAL_SPEED;

    const verticalSpeedAcceptable =
        s.verticalVelocity >= 0 &&
        s.verticalVelocity <=
        LEO_MAX_VERTICAL_SPEED;

    return (
        altitudeReached &&
        horizontalSpeedReached &&
        verticalSpeedAcceptable
    );
}


function completeLEOCheck() {
    if (flightState.over) {
        return;
    }

    if (!hasReachedLEOThreshold()) {
        return;
    }

    flightState.deltaVRemaining =
        calculateRemainingDeltaV();

    const enoughForL2 =
        flightState.deltaVRemaining >=
        L2_INSERTION_DELTA_V_REQUIRED;

    flightState.over = true;

    flightState.result =
        enoughForL2
            ? "l2-success"
            : "leo-success-l2-insufficient";
}


/* =========================================================
   15. MAX Q TRACKING AND FAILURE
========================================================= */

function checkMaxQ() {
    const q = flightState.dynamicPressure;

    if (q > flightState.maxQ) {
        flightState.maxQ = q;
    }

    if (
        flightState.maxQ > 0 &&
        q < flightState.maxQ &&
        flightState.previousQ >= q
    ) {
        flightState.maxQReached = true;
    }

    flightState.previousQ = q;
}


function triggerMaxQFailure() {
    const s = flightState;

    if (s.over) {
        return;
    }

    s.communicationLost = true;

    s.over = true;

    s.result = "max-q-failure";

    pendingCommands = [];

    lastCommandMessage =
        "SIGNAL LOST: CRITICAL MAX Q FAILURE";
}


/* =========================================================
   16. TELEMETRY GAUGES
========================================================= */

function updateGauge(
    name,
    value,
    maximum,
    formatter
) {
    const circle = document.getElementById(
        `${name}-progress`
    );

    const display = document.getElementById(
        `${name}-value`
    );

    if (
        !circle ||
        !display ||
        !Number.isFinite(value) ||
        maximum <= 0
    ) {
        return;
    }

    const percentage = clamp(
        Math.abs(value) / maximum,
        0,
        1
    );

    circle.style.strokeDasharray =
        GAUGE_CIRCUMFERENCE;

    circle.style.strokeDashoffset =
        GAUGE_CIRCUMFERENCE *
        (1 - percentage);

    display.textContent =
        formatter(value);
}


function updateMissionHealth() {
    const status = document.getElementById(
        "flight-status"
    );

    if (!status || flightState.over) {
        return;
    }

    if (flightState.communicationLost) {
        status.textContent =
            "SIGNAL LOST";

    } else if (
        flightState.dynamicPressure >= MAX_Q_FAILURE
    ) {
        status.textContent =
            "CRITICAL MAX Q";

    } else if (
        flightState.dynamicPressure >= MAX_Q_SEVERE &&
        flightState.twr > MAX_Q_TWR_LIMIT
    ) {
        status.textContent =
            "SEVERE MAX Q / HIGH TWR";

    } else if (
        flightState.dynamicPressure >= MAX_Q_SEVERE
    ) {
        status.textContent =
            "SEVERE MAX Q DISTURBANCE";

    } else if (
        flightState.dynamicPressure >= MAX_Q_CAUTION &&
        flightState.twr > MAX_Q_TWR_LIMIT
    ) {
        status.textContent =
            "MAX Q / HIGH TWR BACKLASH";

    } else if (
        flightState.dynamicPressure >= MAX_Q_CAUTION
    ) {
        status.textContent =
            "MAX Q ATTITUDE DISTURBANCE";

    } else if (
        flightState.twr < 1 &&
        flightState.verticalVelocity > 0
    ) {
        status.textContent =
            "ASCENT MARGIN LOW";

    } else if (
        flightState.verticalVelocity < 0
    ) {
        status.textContent =
            "DESCENT DETECTED";

    } else if (
        flightState.verticalAcceleration < 0
    ) {
        status.textContent =
            "VERTICAL ACCELERATION NEGATIVE";

    } else {
        status.textContent =
            "ASCENT GUIDANCE ACTIVE";
    }
}


function updateTelemetry() {
    const s = flightState;

    s.speed = calculateTotalSpeed(
        s.horizontalVelocity,
        s.verticalVelocity
    );

    updateGauge(
        "velocity",
        s.speed,
        TELEMETRY_MAX.velocity,
        formatNumber
    );

    updateGauge(
        "thrust",
        s.thrust / 1000,
        TELEMETRY_MAX.thrust,
        formatNumber
    );

    updateGauge(
        "altitude",
        s.altitude,
        TELEMETRY_MAX.altitude,
        formatNumber
    );

    updateGauge(
        "delta-v",
        s.deltaVRemaining,
        deltaVMaximum || 1,
        formatNumber
    );

    updateGauge(
        "leo-delta-v",
        LEO_NET_DELTA_V_TARGET -
            s.leoDeltaVRemaining,
        LEO_NET_DELTA_V_TARGET,
        () => formatNumber(
            s.leoDeltaVRemaining
        )
    );

    const usefulDeltaV =
        calculateUsefulDeltaV();

    updateGauge(
        "net-delta-v",
        Math.max(0, usefulDeltaV),
        LEO_NET_DELTA_V_TARGET,
        formatNumber
    );

    const setText = (id, value) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    };

    setText(
        "net-delta-v-value",
        formatNumber(usefulDeltaV)
    );

    setText(
        "leo-delta-v-value",
        formatNumber(s.leoDeltaVRemaining)
    );

    setText(
        "mission-time",
        formatMissionTime(s.time)
    );

    setText(
        "throttle-current",
        `${Math.round(s.throttle * 100)}%`
    );

    setText(
        "current-stage",
        `STAGE ${s.stage} / ${vehicleStages.length}`
    );

    setText(
        "telemetry-status",
        s.communicationLost
            ? "SIGNAL LOST"
            : s.over
                ? "SIMULATION ENDED"
                : "TELEMETRY ACTIVE"
    );

    setText(
        "acceleration-value",
        `${s.acceleration.toFixed(2)} m/s²`
    );

    setText(
        "vertical-acceleration-value",
        `${s.verticalAcceleration.toFixed(2)} m/s²`
    );

    setText(
        "horizontal-acceleration-value",
        `${s.horizontalAcceleration.toFixed(2)} m/s²`
    );

    setText(
        "vertical-velocity-value",
        `${formatNumber(s.verticalVelocity)} m/s`
    );

    setText(
        "max-altitude-value",
        `${formatNumber(s.maxAltitude)} m`
    );

    setText(
        "mass-value",
        `${formatNumber(s.mass)} kg`
    );

    setText(
        "twr-value",
        s.twr.toFixed(2)
    );

    setText(
        "drag-value",
        `${formatNumber(s.dragForce)} N`
    );

    setText(
        "pitch-value",
        `${s.pitch.toFixed(1)}°`
    );

    setText(
        "pitch-deviation-value",
        `${s.pitchDeviation.toFixed(1)}°`
    );

    const throttleFill =
        document.getElementById("throttle-fill");

    if (throttleFill) {
        throttleFill.style.width =
            `${s.throttle * 100}%`;
    }

    const qDisplay =
        document.getElementById(
            "dynamic-pressure-value"
        );

    if (qDisplay) {
        qDisplay.textContent =
            `${(s.dynamicPressure / 1000).toFixed(1)} kPa`;
    }

    const qStatus =
        document.getElementById("q-status");

    if (qStatus) {
        if (s.dynamicPressure < MAX_Q_CAUTION) {
            qStatus.textContent = "NORMAL";

        } else if (
            s.dynamicPressure < MAX_Q_SEVERE &&
            s.twr <= MAX_Q_TWR_LIMIT
        ) {
            qStatus.textContent =
                "ATTITUDE DISTURBANCE";

        } else if (
            s.dynamicPressure < MAX_Q_SEVERE &&
            s.twr > MAX_Q_TWR_LIMIT
        ) {
            qStatus.textContent =
                "HIGH TWR BACKLASH";

        } else if (
            s.dynamicPressure < MAX_Q_FAILURE
        ) {
            qStatus.textContent =
                s.twr > MAX_Q_TWR_LIMIT
                    ? "SEVERE / HIGH TWR"
                    : "SEVERE PRESSURE";

        } else {
            qStatus.textContent =
                "CRITICAL FAILURE";
        }
    }

    const maxQLabel =
        document.getElementById("max-q-label");

    if (maxQLabel) {
        maxQLabel.hidden =
            !s.maxQReached;
    }

    const maxQValue =
        document.getElementById("max-q-value");

    if (maxQValue) {
        maxQValue.textContent =
            `${(s.maxQ / 1000).toFixed(1)} kPa`;
    }

    setText(
        "command-status",
        s.communicationLost
            ? "COMMUNICATION LINK LOST"
            : lastCommandMessage
    );

    setText(
        "pending-command-count",
        pendingCommands.length
    );

    updateMissionHealth();
}


/* =========================================================
   17. CONTROL UI
========================================================= */

function updateControlUI() {
    const armButton =
        document.getElementById("armStage");

    const separateButton =
        document.getElementById("separateStage");

    const stageState =
        document.getElementById("stage-state");

    const throttleButtons = [
        ["throttle65", 0.65],
        ["throttle80", 0.80],
        ["throttle100", 1.00]
    ];

    const armPending =
        pendingCommands.some(
            command =>
                command.type === "ARM_STAGE"
        );

    const separationPending =
        pendingCommands.some(
            command =>
                command.type === "SEPARATE_STAGE"
        );

    for (const [id, value] of throttleButtons) {
        const button =
            document.getElementById(id);

        if (!button) {
            continue;
        }

        button.classList.toggle(
            "active",
            Math.abs(
                flightState.throttle - value
            ) < 0.001
        );

        button.disabled =
            flightState.over ||
            flightState.communicationLost ||
            launchSequence.phase !== "FLIGHT";
    }

    if (armButton) {
        armButton.disabled =
            flightState.over ||
            flightState.communicationLost ||
            launchSequence.phase !== "FLIGHT" ||
            !canArmNextStage() ||
            flightState.stageArmed ||
            armPending;
    }

    if (separateButton) {
        separateButton.disabled =
            flightState.over ||
            flightState.communicationLost ||
            launchSequence.phase !== "FLIGHT" ||
            !flightState.stageArmed ||
            separationPending;
    }

    if (stageState) {
        if (flightState.communicationLost) {
            stageState.textContent =
                "COMMAND LINK LOST";

        } else if (launchSequence.phase !== "FLIGHT") {
            stageState.textContent =
                "AWAITING LIFTOFF";

        } else if (flightState.stageArmed) {
            stageState.textContent =
                "NEXT STAGE ARMED";

        } else if (armPending) {
            stageState.textContent =
                "ARMING COMMAND IN TRANSMISSION";

        } else if (!canArmNextStage()) {
            stageState.textContent =
                "NO NEXT STAGE AVAILABLE";

        } else {
            stageState.textContent =
                "CURRENT STAGE ACTIVE";
        }
    }

    const pendingCount =
        document.getElementById(
            "pending-command-count"
        );

    if (pendingCount) {
        pendingCount.textContent =
            pendingCommands.length;
    }

    const commandStatus =
        document.getElementById("command-status");

    if (commandStatus) {
        commandStatus.textContent =
            flightState.communicationLost
                ? "COMMUNICATION LINK LOST"
                : lastCommandMessage;
    }
}


/* =========================================================
   18. RADIO COMMAND SYSTEM
========================================================= */

function sendCommand(
    type,
    value = null,
    label = type
) {
    if (
        flightState.over ||
        flightState.communicationLost ||
        launchSequence.phase !== "FLIGHT"
    ) {
        return;
    }

    pendingCommands.push({
        type,
        value,
        label,

        sentAt: flightState.time,

        executeAt:
            flightState.time + radioLatency
    });

    lastCommandMessage =
        `TRANSMITTING: ${label}`;

    const linkStatus =
        document.getElementById(
            "command-link-status"
        );

    if (linkStatus) {
        linkStatus.textContent =
            "COMMAND IN TRANSMISSION";
    }

    updateControlUI();
}


function setThrottle(value) {
    if (
        flightState.over ||
        flightState.communicationLost ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
    ) {
        return;
    }

    sendCommand(
        "THROTTLE",
        value,
        `THROTTLE ${Math.round(value * 100)}%`
    );
}


function armNextStage() {
    if (
        flightState.over ||
        flightState.communicationLost ||
        !canArmNextStage() ||
        flightState.stageArmed
    ) {
        return;
    }

    sendCommand(
        "ARM_STAGE",
        null,
        "ARM NEXT STAGE"
    );
}


function requestStageSeparation() {
    if (
        flightState.over ||
        flightState.communicationLost ||
        !flightState.stageArmed
    ) {
        return;
    }

    sendCommand(
        "SEPARATE_STAGE",
        null,
        "STAGE SEPARATION"
    );
}


function applyCommand(command) {
    switch (command.type) {
        case "THROTTLE":
            flightState.throttle =
                command.value;

            lastCommandMessage =
                `COMMAND RECEIVED: THROTTLE ${Math.round(command.value * 100)}%`;

            break;

        case "ARM_STAGE":
            if (canArmNextStage()) {
                flightState.stageArmed = true;

                lastCommandMessage =
                    "COMMAND RECEIVED: NEXT STAGE ARMED";

            } else {
                lastCommandMessage =
                    "ARM COMMAND REJECTED";
            }

            break;

        case "SEPARATE_STAGE":
            if (
                flightState.stageArmed &&
                canArmNextStage()
            ) {
                const separatedStage =
                    flightState.stage;

                separateCurrentStage();

                lastCommandMessage =
                    `STAGE ${separatedStage} SEPARATED`;

            } else {
                lastCommandMessage =
                    "SEPARATION REJECTED: STAGE NOT ARMED";
            }

            break;
    }

    updateTelemetry();
    updateControlUI();
}


function processPendingCommands() {
    if (flightState.communicationLost) {
        pendingCommands = [];
        return;
    }

    while (
        pendingCommands.length > 0 &&
        pendingCommands[0].executeAt <=
            flightState.time
    ) {
        applyCommand(
            pendingCommands.shift()
        );
    }
}


/* =========================================================
   19. STAGE SEPARATION
========================================================= */

function separateCurrentStage() {
    const currentStage =
        getCurrentStage();

    if (
        !currentStage ||
        !canArmNextStage()
    ) {
        return false;
    }

    /*
       Remove the separated stage's remaining fuel.

       Its dry mass is removed automatically when
       stageIndex advances and calculateVehicleMass()
       recalculates the remaining vehicle.
    */

    currentStage.fuelRemaining = 0;

    if (flightState.stageIndex === 0) {
        boosterFuelRemaining = 0;
    }

    flightState.stageIndex++;

    flightState.stage =
        flightState.stageIndex + 1;

    flightState.stageArmed = false;

    /*
       Preserve all position and velocity components.

       Separation changes vehicle mass and available
       thrust, not the existing velocity.
    */

    flightState.mass =
        calculateVehicleMass();

    flightState.fuel =
        calculateTotalRemainingFuel();

    flightState.thrust =
        getCurrentThrust();

    flightState.twr =
        calculateTWR();

    flightState.deltaVRemaining =
        calculateRemainingDeltaV();

    updateTelemetry();
    updateControlUI();

    return true;
}


/* =========================================================
   20. PROPULSION AND FUEL CONSUMPTION
========================================================= */

function calculatePropulsionForStep(
    dt,
    stage,
    maximumAllowedThrust = Infinity
) {
    if (dt <= 0) {
        return {
            totalThrust: 0,
            coreConsumed: 0,
            boosterConsumed: 0
        };
    }

    const throttle =
        flightState.throttle;

    const coreNominalThrust =
        stage && stage.fuelRemaining > 0
            ? stage.thrust * throttle
            : 0;

    const boosterNominalThrust =
        flightState.stageIndex === 0 &&
        boosterFuelRemaining > 0 &&
        vehicle?.booster
            ? vehicle.booster.thrust * throttle
            : 0;

    const nominalTotalThrust =
        coreNominalThrust +
        boosterNominalThrust;

    const thrustScale =
        nominalTotalThrust > 0
            ? clamp(
                maximumAllowedThrust /
                    nominalTotalThrust,
                0,
                1
            )
            : 0;

    const coreAppliedThrust =
        coreNominalThrust * thrustScale;

    const boosterAppliedThrust =
        boosterNominalThrust * thrustScale;

    const coreFlow =
        calculateFuelFlow(
            coreAppliedThrust,
            stage?.isp || 0
        );

    const boosterFlow =
        calculateFuelFlow(
            boosterAppliedThrust,
            vehicle?.booster?.isp || 0
        );

    const coreBurnTime =
        coreFlow > 0
            ? Math.min(
                dt,
                stage.fuelRemaining / coreFlow
            )
            : 0;

    const boosterBurnTime =
        boosterFlow > 0
            ? Math.min(
                dt,
                boosterFuelRemaining / boosterFlow
            )
            : 0;

    const coreConsumed =
        coreFlow * coreBurnTime;

    const boosterConsumed =
        boosterFlow * boosterBurnTime;

    if (stage) {
        stage.fuelRemaining = Math.max(
            0,
            stage.fuelRemaining -
                coreConsumed
        );
    }

    boosterFuelRemaining = Math.max(
        0,
        boosterFuelRemaining -
            boosterConsumed
    );

    const coreAverageThrust =
        coreAppliedThrust *
        coreBurnTime / dt;

    const boosterAverageThrust =
        boosterAppliedThrust *
        boosterBurnTime / dt;

    return {
        totalThrust:
            coreAverageThrust +
            boosterAverageThrust,

        coreConsumed,

        boosterConsumed
    };
}


/* =========================================================
   21. TWO-DIMENSIONAL FLIGHT PHYSICS
========================================================= */

function simulateStep(dt) {
    if (
        flightState.over ||
        launchSequence.phase !== "FLIGHT"
    ) {
        return;
    }

    processPendingCommands();

    const s = flightState;

    const stage = getCurrentStage();

    if (!stage) {
        s.over = true;
        s.result = "failure";
        return;
    }

    const altitudeBefore =
        s.altitude;

    const horizontalVelocityBefore =
        s.horizontalVelocity;

    const verticalVelocityBefore =
        s.verticalVelocity;

    const speedBefore =
        calculateTotalSpeed(
            horizontalVelocityBefore,
            verticalVelocityBefore
        );

    s.speed = speedBefore;

    const gravity =
        calculateGravity(altitudeBefore);

    const dynamicPressure =
        calculateDynamicPressure(
            altitudeBefore,
            speedBefore
        );

    const dragMagnitude =
        calculateDrag(
            altitudeBefore,
            speedBefore
        );

    s.dynamicPressure =
        dynamicPressure;

    s.dragForce =
        dragMagnitude;

    if (dynamicPressure >= MAX_Q_FAILURE) {
        s.maxQ = Math.max(
            s.maxQ,
            dynamicPressure
        );

        triggerMaxQFailure();

        return;
    }

    let dragHorizontal = 0;
    let dragVertical = 0;

    if (speedBefore > 0.001) {
        dragHorizontal =
            -dragMagnitude *
            horizontalVelocityBefore /
            speedBefore;

        dragVertical =
            -dragMagnitude *
            verticalVelocityBefore /
            speedBefore;
    }

    /*
       Calculate guidance using the current thrust
       and current vehicle mass.
    */

    updatePitchGuidance(dt);

    const pitchRadians =
        degreesToRadians(s.pitch);

    const massBefore =
        calculateVehicleMass();

    if (
        !Number.isFinite(massBefore) ||
        massBefore <= 0
    ) {
        s.over = true;
        s.result = "failure";
        return;
    }

    const allowedAcceleration =
        calculateAccelerationLimit(s.time);

    /*
       Corrected thrust limiter.

       Use the actual vertical pitch component instead
       of assuming a minimum vertical fraction of 0.15.

       The limiter accounts for the actual vertical drag
       component rather than the entire drag magnitude.
    */

    const verticalPitchFactor =
        Math.max(
            0.01,
            Math.cos(pitchRadians)
        );

    const maximumAllowedThrust =
        (
            massBefore *
            (
                gravity +
                allowedAcceleration
            ) -
            dragVertical
        ) / verticalPitchFactor;

    const propulsion =
        calculatePropulsionForStep(
            dt,
            stage,
            Math.max(
                0,
                maximumAllowedThrust
            )
        );

    const thrust =
        propulsion.totalThrust;

    const massAfter =
        calculateVehicleMass();

    if (
        !Number.isFinite(massAfter) ||
        massAfter <= 0
    ) {
        s.over = true;
        s.result = "failure";
        return;
    }

    const averageMass = Math.max(
        1,
        (massBefore + massAfter) / 2
    );

    const horizontalThrust =
        thrust * Math.sin(pitchRadians);

    const verticalThrust =
        thrust * Math.cos(pitchRadians);

    const horizontalAcceleration =
        (
            horizontalThrust +
            dragHorizontal
        ) / averageMass;

    const verticalAcceleration =
        (
            verticalThrust +
            dragVertical
        ) / averageMass -
        gravity;

    /*
       Integrate velocity.
    */

    const horizontalVelocityAfter =
        horizontalVelocityBefore +
        horizontalAcceleration * dt;

    const verticalVelocityAfter =
        verticalVelocityBefore +
        verticalAcceleration * dt;

    /*
       Trapezoidal position integration.
    */

    const horizontalPositionAfter =
        s.horizontalPosition +
        (
            horizontalVelocityBefore +
            horizontalVelocityAfter
        ) / 2 * dt;

    const altitudeAfter =
        altitudeBefore +
        (
            verticalVelocityBefore +
            verticalVelocityAfter
        ) / 2 * dt;

    const speedAfter =
        calculateTotalSpeed(
            horizontalVelocityAfter,
            verticalVelocityAfter
        );

    /*
       Update state.
    */

    s.thrust = thrust;

    s.mass = massAfter;

    s.horizontalAcceleration =
        horizontalAcceleration;

    s.verticalAcceleration =
        verticalAcceleration;

    s.acceleration =
        calculateTotalSpeed(
            horizontalAcceleration,
            verticalAcceleration
        );

    s.horizontalVelocity =
        horizontalVelocityAfter;

    s.verticalVelocity =
        verticalVelocityAfter;

    s.horizontalPosition =
        horizontalPositionAfter;

    s.altitude =
        altitudeAfter;

    s.speed =
        speedAfter;

    s.time += dt;

    /*
       Delta-v bookkeeping.
    */

    if (speedBefore > 0.001) {
        const velocityUnitX =
            horizontalVelocityBefore /
            speedBefore;

        const velocityUnitY =
            verticalVelocityBefore /
            speedBefore;

        const thrustAlongTrack =
            horizontalThrust *
                velocityUnitX +
            verticalThrust *
                velocityUnitY;

        const engineAlongAcceleration =
            thrustAlongTrack /
            averageMass;

        s.engineDeltaVUsed +=
            engineAlongAcceleration * dt;

        const gravityLossAcceleration =
            gravity *
            Math.max(
                0,
                verticalVelocityBefore /
                    speedBefore
            );

        s.gravityLoss +=
            gravityLossAcceleration * dt;

        const dragLossAcceleration =
            dragMagnitude / averageMass;

        s.dragLoss +=
            dragLossAcceleration * dt;
    }

    /*
       Update maximum altitude and remaining resources.
    */

    s.maxAltitude = Math.max(
        s.maxAltitude,
        s.altitude
    );

    s.fuel =
        calculateTotalRemainingFuel();

    s.deltaVRemaining =
        calculateRemainingDeltaV();

    /*
       Calculate TWR using the new mass and current thrust.
    */

    s.twr =
        s.mass > 0
            ? getCurrentThrust() /
                (
                    s.mass *
                    calculateGravity(s.altitude)
                )
            : 0;

    checkMaxQ();

    s.leoDeltaVRemaining =
        calculateLEODeltaVRemaining();

    completeLEOCheck();

    if (s.over) {
        return;
    }

    /*
       Ground impact.
    */

    if (
        s.altitude <= 0 &&
        s.time > dt
    ) {
        s.altitude = 0;

        s.groundImpact = true;

        s.over = true;

        s.result = "ground-impact";

        return;
    }

    /*
       Propellant exhaustion and apogee.
    */

    const allPropellantExhausted =
        s.fuel <= 0.000001 &&
        getCurrentThrust() <= 0;

    if (
        allPropellantExhausted &&
        s.verticalVelocity <= 0 &&
        s.altitude > 0
    ) {
        s.over = true;

        s.result = "apogee";

        return;
    }

    /*
       Simulation time limit.
    */

    if (s.time >= MAX_SIMULATION_TIME) {
        s.over = true;

        s.result = "time-limit";
    }
}


/* =========================================================
   22. END-OF-FLIGHT REPORT
========================================================= */

function showResult() {
    if (resultShown) {
        return;
    }

    resultShown = true;

    const missionResult = {
        status:
            flightState.result,

        destination:
            "Sun-Earth L2",

        message:
            getFlightResultMessage(),

        arrival:
            getFlightArrivalMessage(),

        missionElapsedTime:
            flightState.time,

        remainingDeltaV:
            flightState.deltaVRemaining,

        l2DeltaVRequired:
            L2_INSERTION_DELTA_V_REQUIRED,

        maxQ:
            flightState.maxQ,

        maxAltitude:
            flightState.maxAltitude,

        totalVelocity:
            flightState.speed,

        horizontalVelocity:
            flightState.horizontalVelocity,

        verticalVelocity:
            flightState.verticalVelocity,

        verticalAcceleration:
            flightState.verticalAcceleration,

        horizontalAcceleration:
            flightState.horizontalAcceleration,

        engineDeltaVUsed:
            flightState.engineDeltaVUsed,

        gravityLoss:
            flightState.gravityLoss,

        dragLoss:
            flightState.dragLoss,

        usefulDeltaV:
            calculateUsefulDeltaV(),

        pitch:
            flightState.pitch,

        dynamicPressure:
            flightState.dynamicPressure,

        communicationLost:
            flightState.communicationLost,

        groundImpact:
            flightState.groundImpact
    };

    sessionStorage.setItem(
        "romanMissionResult",
        JSON.stringify(missionResult)
    );

    window.location.assign(
        RESULT_PAGE_URL
    );
}


/* =========================================================
   22A. RESULT MESSAGE
========================================================= */

function getFlightResultMessage() {
    switch (flightState.result) {

        case "l2-success":
            return (
                "The spacecraft has reached the LEO mission threshold " +
                "and has sufficient remaining delta-v for the " +
                "Sun-Earth L2 transfer."
            );

        case "leo-success-l2-insufficient":
            return (
                "The spacecraft reached the LEO mission threshold, " +
                "but did not retain enough delta-v for the L2 transfer."
            );

        case "intentional-abort":
            return (
                "The launch sequence was intentionally aborted " +
                "because GO FOR LAUNCH authorization was not received " +
                "within the permitted HOLD period."
            );

        case "max-q-failure":
            return (
                "Dynamic pressure exceeded the simulator's critical " +
                "structural limit. Vehicle failure declared and " +
                "communication link lost."
            );

        case "apogee":
            return (
                "The vehicle exhausted its propellant and entered " +
                "an unpowered descent before reaching the LEO " +
                "mission threshold. This is not orbital insertion."
            );

        case "ground-impact":
            return (
                "The vehicle returned to the launch surface before " +
                "completing the LEO mission threshold."
            );

        case "time-limit":
            return (
                "The maximum simulation duration was reached before " +
                "the LEO mission threshold was achieved."
            );

        case "failure":
        default:
            return (
                "The two-dimensional flight simulation ended " +
                "before the LEO mission threshold was achieved."
            );
    }
}


/* =========================================================
   22B. RESULT ARRIVAL
========================================================= */

function getFlightArrivalMessage() {
    switch (flightState.result) {

        case "l2-success":
            return (
                "Expected arrival in less than 4 months."
            );

        case "leo-success-l2-insufficient":
            return (
                "L2 transfer cannot be completed with the remaining delta-v."
            );

        case "intentional-abort":
            return (
                "Launch authorization not received. No liftoff occurred."
            );

        case "max-q-failure":
            return (
                "Mission terminated during ascent."
            );

        case "apogee":
            return (
                "No LEO mission threshold achieved. No orbital insertion."
            );

        case "ground-impact":
            return (
                "Mission terminated before ascent completion."
            );

        case "time-limit":
            return (
                "Mission terminated at the simulation time limit."
            );

        case "failure":
        default:
            return (
                "Mission could not be completed."
            );
    }
}


/* =========================================================
   23. REAL-TIME PHYSICS AND LAUNCH SEQUENCE LOOP
========================================================= */

function runPhysicsFrame(currentTime) {
    if (flightState.over) {
        showResult();
        return;
    }

    if (lastPhysicsTime === null) {
        lastPhysicsTime = currentTime;
    }

    const realElapsed = Math.max(
        0,
        (currentTime - lastPhysicsTime) / 1000
    );

    lastPhysicsTime = currentTime;

    /*
       COUNTDOWN AND HOLD

       No physics is simulated before T+0.
    */

    if (launchSequence.phase !== "FLIGHT") {
        updateLaunchSequence(realElapsed);

        updateTelemetry();

        updateControlUI();

        if (flightState.over) {
            showResult();
            return;
        }

        requestAnimationFrame(
            runPhysicsFrame
        );

        return;
    }

    /*
       Flight physics begins after T+0.
    */

    physicsAccumulator += realElapsed;

    let steps = 0;

    while (
        physicsAccumulator >=
            FIXED_PHYSICS_STEP &&
        steps < MAX_CATCH_UP_STEPS_PER_FRAME
    ) {
        simulateStep(
            FIXED_PHYSICS_STEP
        );

        physicsAccumulator -=
            FIXED_PHYSICS_STEP;

        steps++;

        if (flightState.over) {
            showResult();
            return;
        }
    }

    updateTelemetry();

    updateControlUI();

    requestAnimationFrame(
        runPhysicsFrame
    );
}


/* =========================================================
   24. INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        const selectedWindow =
            localStorage.getItem("selectedWindow");

        const savedRocket =
            localStorage.getItem("rocket");

        const details =
            document.getElementById("flight-details");

        const telemetryPanel =
            document.getElementById("telemetry-panel");

        const controlsPanel =
            document.getElementById("controls-panel");

        const qPanel =
            document.getElementById("q-panel");

        const noWindow =
            document.getElementById("no-window");

        const noRocket =
            document.getElementById("no-rocket");


        function hideFlightPanels() {
            details?.classList.add("d-none");

            telemetryPanel?.classList.add("d-none");

            controlsPanel?.classList.add("d-none");

            qPanel?.classList.add("d-none");
        }


        if (!selectedWindow) {
            hideFlightPanels();

            noWindow?.classList.remove("d-none");

            return;
        }


        let flight;

        try {
            flight = JSON.parse(selectedWindow);

        } catch (error) {
            console.error(
                "Invalid launch-window data:",
                error
            );

            hideFlightPanels();

            noWindow?.classList.remove("d-none");

            return;
        }

        if (
            !flight ||
            typeof flight !== "object" ||
            Array.isArray(flight)
        ) {
            hideFlightPanels();

            noWindow?.classList.remove("d-none");

            return;
        }


        let rocket;

        try {
            rocket = savedRocket
                ? JSON.parse(savedRocket)
                : null;

        } catch (error) {
            console.error(
                "Invalid rocket configuration:",
                error
            );

            rocket = null;
        }


        vehicle =
            buildVehicleConfiguration(rocket);

        if (!vehicle) {
            hideFlightPanels();

            noRocket?.classList.remove("d-none");

            return;
        }


        const setText = (id, value) => {
            const element =
                document.getElementById(id);

            if (element) {
                element.textContent = value;
            }
        };


        setText(
            "window-name",
            String(
                flight.name ||
                "Selected Window"
            )
                .replaceAll("_", " ")
                .toUpperCase()
        );

        setText(
            "launch-date",
            flight.date || "--"
        );

        setText(
            "launch-time",
            flight.time || "--"
        );

        setText(
            "launch-weather",
            flight.weather || "--"
        );


        const difficulty =
            Number(flight.difficulty);

        setText(
            "launch-difficulty",
            Number.isFinite(difficulty)
                ? `${difficulty * 100}%`
                : "--"
        );


        vehicleStages =
            vehicle.stages;

        radioLatency =
            vehicle.radioLatency;

        boosterFuelRemaining =
            vehicle.booster.fuelRemaining;


        Object.assign(
            flightState,
            {
                time: 0,

                altitude: 0,

                horizontalPosition: 0,

                verticalVelocity: 0,

                horizontalVelocity: 0,

                speed: 0,

                acceleration: 0,

                verticalAcceleration: 0,

                horizontalAcceleration: 0,

                mass: vehicle.totalMass,

                fuel: 0,

                thrust: 0,

                throttle: 1,

                stage: 1,

                stageIndex: 0,

                stageArmed: false,

                pitch: 0,

                commandedPitch: 0,

                pitchDeviation: 0,

                maxQDisturbance: 0,

                deltaVRemaining: 0,

                leoDeltaVRemaining:
                    LEO_NET_DELTA_V_TARGET,

                engineDeltaVUsed: 0,

                gravityLoss: 0,

                dragLoss: 0,

                twr: 0,

                dynamicPressure: 0,

                dragForce: 0,

                maxQ: 0,

                maxQReached: false,

                previousQ: 0,

                maxAltitude: 0,

                groundImpact: false,

                communicationLost: false,

                over: false,

                result: null
            }
        );


        pendingCommands = [];

        lastCommandMessage =
            "Awaiting command";

        resultShown = false;


        flightState.fuel =
            calculateTotalRemainingFuel();

        flightState.mass =
            calculateVehicleMass();


        TELEMETRY_MAX.thrust =
            Math.max(
                1,
                vehicle.maxThrust / 1000
            );


        deltaVMaximum =
            calculateRemainingDeltaV();

        flightState.deltaVRemaining =
            deltaVMaximum;


        setText(
            "thrust-max",
            `${formatNumber(TELEMETRY_MAX.thrust)} kN`
        );

        setText(
            "delta-v-max",
            `${formatNumber(deltaVMaximum)} m/s`
        );

        setText(
            "leo-delta-v-max",
            `${formatNumber(LEO_NET_DELTA_V_TARGET)} m/s`
        );

        setText(
            "net-delta-v-max",
            `${formatNumber(LEO_NET_DELTA_V_TARGET)} m/s`
        );

        setText(
            "leo-delta-v-value",
            formatNumber(
                LEO_NET_DELTA_V_TARGET
            )
        );

        setText(
            "net-delta-v-value",
            "0"
        );

        setText(
            "radio-latency",
            `${radioLatency.toFixed(1)} seconds`
        );


        document.getElementById("throttle65")
            ?.addEventListener(
                "click",
                () => setThrottle(0.65)
            );

        document.getElementById("throttle80")
            ?.addEventListener(
                "click",
                () => setThrottle(0.80)
            );

        document.getElementById("throttle100")
            ?.addEventListener(
                "click",
                () => setThrottle(1.00)
            );

        document.getElementById("armStage")
            ?.addEventListener(
                "click",
                armNextStage
            );

        document.getElementById("separateStage")
            ?.addEventListener(
                "click",
                requestStageSeparation
            );


        setText(
            "flight-status",
            "AWAITING LAUNCH AUTHORIZATION"
        );


        /*
           Initialize launch sequence.
        */

        launchSequence = {
            phase: "COUNTDOWN",
            elapsed: 0,
            holdElapsed: 0,
            goReceived: false
        };

        createLaunchSequenceUI();

        updateLaunchDisplay();

        updateTelemetry();

        updateControlUI();


        lastPhysicsTime = null;

        physicsAccumulator = 0;

        requestAnimationFrame(
            runPhysicsFrame
        );
    }
);