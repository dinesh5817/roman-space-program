
/* =========================================================
   ROMAN SPACE PROGRAM
   FLIGHT OPERATIONS - 2D ASCENT

   GAME SIMULATION MODEL

   Physics:
   - 2D Cartesian motion in a flat local frame
   - Variable gravitational magnitude
   - Exponential atmospheric density
   - 2D aerodynamic drag
   - Rocket equation for remaining delta-v
   - Propellant mass flow from thrust and ISP
   - Midpoint mass approximation
   - Fixed-step integration

   Guidance:
   - State-dependent pitch guidance
   - Uses altitude and velocity components
   - Corrects horizontal/vertical velocity imbalance
   - Responds to TWR and available thrust
   - Dynamic-pressure attitude disturbance
   - Critical dynamic-pressure failure

   Communication:
   - Radio command latency
   - Command link failure during critical Max Q event

   UNITS:
   Mass: kg
   Distance: m
   Velocity: m/s
   Acceleration: m/s²
   Force: N
   Pressure: Pa
   Time: s
   ISP: s

   VEHICLE CONFIGURATION:
   Engine thrust: kN
   Booster thrust: kN
   Mass: kg
   Fuel: kg
   ISP: seconds

   IMPORTANT:
   This is a simplified game simulation.
   It does not calculate real orbital mechanics.
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
   4. MAX Q GAMEPLAY LIMITS
========================================================= */

const MAX_Q_CAUTION = 45000;
const MAX_Q_SEVERE = 65000;
const MAX_Q_FAILURE = 80000;

const MAX_Q_DISTURBANCE_BIAS = 12;
const MAX_Q_DISTURBANCE_OSCILLATION = 5;

const MAX_Q_DISTURBANCE_FREQUENCY = 2.4;


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

    /*
       boosterEngine.fuel is total fuel for
       the complete booster set.
    */

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
                quantityValue < 1
            ) {
                return null;
            }

            const quantity =
                Math.floor(quantityValue);

            const engineMass =
                Number(engine.mass ?? 0) *
                quantity;

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
        boosterThrust > 0 &&
        boosterISP <= 0
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


const flightState = {
    time: 0,

    altitude: 0,

    horizontalPosition: 0,

    verticalVelocity: 0,

    horizontalVelocity: 0,

    speed: 0,

    acceleration: 0,

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
   9. STAGE AND PROPULSION HELPERS
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
   10. ENVIRONMENT
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
   11. STATE-DEPENDENT PITCH GUIDANCE
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

    const bias =
        MAX_Q_DISTURBANCE_BIAS *
        severity;

    const oscillation =
        Math.sin(
            flightState.time *
            MAX_Q_DISTURBANCE_FREQUENCY
        ) *
        MAX_Q_DISTURBANCE_OSCILLATION *
        severity;

    return bias + oscillation;
}


function updatePitchGuidance(dt) {
    const s = flightState;

    const targetPitch =
        calculateCommandedPitch();

    s.commandedPitch = targetPitch;

    const disturbance =
        calculateMaxQDisturbance();

    s.maxQDisturbance = disturbance;

    const disturbedTargetPitch =
        clamp(
            targetPitch + disturbance,
            0,
            89
        );

    const currentTWR =
        calculateTWR();

    let finalTargetPitch =
        disturbedTargetPitch;

    if (
        currentTWR < 1 &&
        s.verticalVelocity < 500
    ) {
        finalTargetPitch = Math.min(
            finalTargetPitch,
            s.pitch
        );
    }

    const maximumChange =
        GUIDANCE_MAX_PITCH_RATE * dt;

    const responsivePitch =
        moveTowards(
            s.pitch,
            finalTargetPitch,
            maximumChange
        );

    const responseFactor =
        clamp(
            GUIDANCE_RESPONSE_RATE * dt,
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
        0,
        89
    );

    s.pitchDeviation =
        Math.max(
            0,
            s.pitch - s.commandedPitch
        );
}


/* =========================================================
   12. REMAINING IDEAL DELTA-V
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
   13. USEFUL DELTA-V AND LEO CHECK
========================================================= */

/*
   Useful delta-v is the engine contribution
   minus accumulated gravity and drag losses.

   This is the same value displayed by the
   USEFUL ΔV ACCUMULATED gauge.
*/

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


function completeLEOCheck() {
    if (
        flightState.over ||
        flightState.leoDeltaVRemaining > 0
    ) {
        return;
    }

    flightState.deltaVRemaining =
        calculateRemainingDeltaV();

    const enoughForL2 =
        flightState.deltaVRemaining >
        L2_INSERTION_DELTA_V_REQUIRED;

    const missionResult = {
        status:
            enoughForL2
                ? "success"
                : "incomplete",

        destination: "Sun-Earth L2",

        message: enoughForL2
            ? "LEO mission threshold achieved. The spacecraft is coasting towards Sun-Earth L2."
            : "The spacecraft reached the LEO mission threshold, but does not have enough remaining delta-v for the L2 transfer.",

        arrival: enoughForL2
            ? "Expected arrival in less than 4 months."
            : "L2 transfer cannot be completed with the remaining delta-v.",

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

        horizontalVelocity:
            flightState.horizontalVelocity,

        verticalVelocity:
            flightState.verticalVelocity,

        pitch:
            flightState.pitch
    };

    sessionStorage.setItem(
        "romanMissionResult",
        JSON.stringify(missionResult)
    );

    flightState.over = true;

    flightState.result = enoughForL2
        ? "l2-success"
        : "leo-success-l2-insufficient";

    window.location.assign(
        RESULT_PAGE_URL
    );
}


/* =========================================================
   14. MAX Q TRACKING AND FAILURE
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
   15. TELEMETRY GAUGES
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
        flightState.dynamicPressure >= MAX_Q_SEVERE
    ) {
        status.textContent =
            "SEVERE MAX Q DISTURBANCE";

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

    } else {
        status.textContent =
            "ASCENT GUIDANCE ACTIVE";
    }
}


function updateTelemetry() {
    const s = flightState;

    /*
       TOTAL VELOCITY

       The magnitude includes both horizontal
       and vertical velocity components.
    */

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

    /*
       USEFUL DELTA-V ACCUMULATED

       Uses the same calculation as the
       LEO remaining delta-v requirement.

       Negative values are displayed numerically,
       but the progress ring stays at zero.
    */

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
            s.dynamicPressure < MAX_Q_SEVERE
        ) {
            qStatus.textContent =
                "ATTITUDE DISTURBANCE";

        } else if (
            s.dynamicPressure < MAX_Q_FAILURE
        ) {
            qStatus.textContent =
                "SEVERE PRESSURE";

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
   16. CONTROL UI
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
            flightState.communicationLost;
    }

    if (armButton) {
        armButton.disabled =
            flightState.over ||
            flightState.communicationLost ||
            !canArmNextStage() ||
            flightState.stageArmed ||
            armPending;
    }

    if (separateButton) {
        separateButton.disabled =
            flightState.over ||
            flightState.communicationLost ||
            !flightState.stageArmed ||
            separationPending;
    }

    if (stageState) {
        if (flightState.communicationLost) {
            stageState.textContent =
                "COMMAND LINK LOST";

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
   17. RADIO COMMAND SYSTEM
========================================================= */

function sendCommand(
    type,
    value = null,
    label = type
) {
    if (
        flightState.over ||
        flightState.communicationLost
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
   18. STAGE SEPARATION
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

    currentStage.fuelRemaining = 0;

    if (flightState.stageIndex === 0) {
        boosterFuelRemaining = 0;
    }

    flightState.stageIndex++;

    flightState.stage =
        flightState.stageIndex + 1;

    flightState.stageArmed = false;

    flightState.mass =
        calculateVehicleMass();

    flightState.fuel =
        calculateTotalRemainingFuel();

    flightState.deltaVRemaining =
        calculateRemainingDeltaV();

    updateTelemetry();
    updateControlUI();

    return true;
}


/* =========================================================
   19. PROPULSION AND FUEL CONSUMPTION
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
   20. TWO-DIMENSIONAL FLIGHT PHYSICS
========================================================= */

function simulateStep(dt) {
    if (flightState.over) {
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

    const verticalPitchFactor =
        Math.max(
            0.15,
            Math.cos(pitchRadians)
        );

    const maximumAllowedThrust =
        (
            massBefore *
            (
                gravity +
                allowedAcceleration
            ) +
            dragMagnitude
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

    const horizontalVelocityAfter =
        horizontalVelocityBefore +
        horizontalAcceleration * dt;

    const verticalVelocityAfter =
        verticalVelocityBefore +
        verticalAcceleration * dt;

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

    s.thrust = thrust;

    s.mass = massAfter;

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
       Delta-v accounting.
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

    s.maxAltitude = Math.max(
        s.maxAltitude,
        s.altitude
    );

    s.fuel =
        calculateTotalRemainingFuel();

    s.deltaVRemaining =
        calculateRemainingDeltaV();

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

    if (s.time >= MAX_SIMULATION_TIME) {
        s.over = true;

        s.result = "time-limit";
    }
}


/* =========================================================
   21. END-OF-FLIGHT REPORT
========================================================= */

function showResult() {
    if (resultShown) {
        return;
    }

    resultShown = true;

    const panel =
        document.getElementById("flight-result");

    const title =
        document.getElementById("flight-result-title");

    const message =
        document.getElementById("flight-result-message");

    const status =
        document.getElementById("flight-status");

    if (panel) {
        panel.classList.remove("d-none");
    }

    let resultTitle = "FLIGHT TERMINATED";

    let resultMessage =
        "The two-dimensional flight simulation ended.";

    const isFailure = [
        "max-q-failure",
        "apogee",
        "ground-impact",
        "time-limit"
    ].includes(flightState.result);

    if (flightState.result === "l2-success") {
        resultTitle = "MISSION SUCCESS";

        resultMessage =
            "The spacecraft has sufficient remaining delta-v for the Sun-Earth L2 transfer. It is coasting towards L2, with arrival expected in less than 4 months.";

        if (status) {
            status.textContent = "L2 TRANSFER UNDERWAY";
        }

    } else if (
        flightState.result === "leo-success-l2-insufficient"
    ) {
        resultTitle =
            "LEO REACHED, L2 TRANSFER UNAVAILABLE";

        resultMessage =
            "The spacecraft reached the LEO mission threshold, but did not retain enough delta-v for the L2 transfer.";

        if (status) {
            status.textContent = "L2 DELTA-V INSUFFICIENT";
        }

    } else if (
        flightState.result === "max-q-failure"
    ) {
        resultTitle = "CRITICAL MAX Q FAILURE";

        resultMessage =
            "Dynamic pressure exceeded the simulator's critical structural limit. Vehicle failure declared. Communication link lost and all pending commands discarded.";

        if (status) {
            status.textContent = "CRITICAL MAX Q FAILURE";
        }

    } else if (
        flightState.result === "apogee"
    ) {
        resultTitle = "ASCENT ENDED AT APOGEE";

        resultMessage =
            "The vehicle exhausted its propellant and entered an unpowered descent. This is not orbital insertion.";

        if (status) {
            status.textContent = "APOGEE REACHED";
        }

    } else if (
        flightState.result === "ground-impact"
    ) {
        resultTitle = "FLIGHT TERMINATED";

        resultMessage =
            "The vehicle returned to the launch surface before completing the ascent profile.";

        if (status) {
            status.textContent = "GROUND IMPACT";
        }

    } else if (
        flightState.result === "time-limit"
    ) {
        resultTitle = "SIMULATION TIME LIMIT";

        resultMessage =
            "The maximum simulation duration was reached before the flight naturally ended.";

        if (status) {
            status.textContent = "TIME LIMIT";
        }

    } else {
        if (status) {
            status.textContent = "FLIGHT FAILURE";
        }
    }

    resultMessage +=
        ` MET: ${formatMissionTime(flightState.time)}.`;

    resultMessage +=
        ` Maximum altitude: ${formatNumber(flightState.maxAltitude)} m.`;

    resultMessage +=
        ` Total velocity: ${formatNumber(flightState.speed)} m/s.`;

    resultMessage +=
        ` Horizontal velocity: ${formatNumber(flightState.horizontalVelocity)} m/s.`;

    resultMessage +=
        ` Vertical velocity: ${formatNumber(flightState.verticalVelocity)} m/s.`;

    resultMessage +=
        ` Peak dynamic pressure: ${formatNumber(flightState.maxQ)} Pa.`;

    resultMessage +=
        ` Engine ΔV used: ${formatNumber(flightState.engineDeltaVUsed)} m/s.`;

    resultMessage +=
        ` Gravity loss: ${formatNumber(flightState.gravityLoss)} m/s.`;

    resultMessage +=
        ` Drag loss: ${formatNumber(flightState.dragLoss)} m/s.`;

    resultMessage +=
        ` Useful ΔV accumulated: ${formatNumber(calculateUsefulDeltaV())} m/s.`;

    resultMessage +=
        ` Final pitch: ${flightState.pitch.toFixed(1)} degrees.`;

    if (title) {
        title.textContent = resultTitle;
    }

    if (message) {
        message.textContent = resultMessage;
    }

    const telemetryStatus =
        document.getElementById("telemetry-status");

    if (telemetryStatus) {
        telemetryStatus.textContent =
            flightState.communicationLost
                ? "SIGNAL LOST"
                : "SIMULATION ENDED";
    }

    pendingCommands = [];

    const actions =
        document.getElementById("flight-result-actions");

    if (actions) {
        actions.innerHTML = "";

        if (isFailure) {
            const backButton =
                document.createElement("button");

            backButton.type = "button";
            backButton.textContent = "GO BACK";
            backButton.className = "btn btn-primary";

            backButton.addEventListener("click", () => {
                window.location.href = "/";
            });

            actions.appendChild(backButton);
        }
    }

    updateTelemetry();

    updateControlUI();
}


/* =========================================================
   22. REAL-TIME PHYSICS LOOP
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

    requestAnimationFrame(
        runPhysicsFrame
    );
}


/* =========================================================
   23. INITIALIZATION
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
            "ASCENT GUIDANCE READY"
        );

        updateTelemetry();

        updateControlUI();


        lastPhysicsTime = null;

        physicsAccumulator = 0;

        requestAnimationFrame(
            runPhysicsFrame
        );
    }
);
