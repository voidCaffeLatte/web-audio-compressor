const getElementByIdOrThrow = (id) => {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element not found: ${id}`);
    }
    return element;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ANALYSER_DB_MIN = -100;
const ANALYSER_DB_MAX = 0;
const METER_UPDATE_INTERVAL_MS = 500;

const createLazy = (factory) => {
    let instance;

    return {
        get: () => {
            if (instance === undefined) instance = factory();
            return instance;
        },
        peek: () => instance,
    };
};

const toPercent = (value, min, max) => {
    if (value === null) return 0;
    return clamp(((value - min) / (max - min)) * 100, 0, 100);
};

const parseBoolean = (raw, defaultValue) => (typeof raw === 'boolean' ? raw : defaultValue);

const parseNumber = (raw, min, max, defaultValue) => {
    if (raw === undefined) return defaultValue;

    const numeric = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(numeric)) return defaultValue;

    return clamp(numeric, min, max);
};

class Config {
    static CONFIG_STORAGE_KEY = 'config';

    static THRESHOLD_MIN = -100;
    static THRESHOLD_MAX = 0;
    static THRESHOLD_STEP = 1;
    static THRESHOLD_DEFAULT = -24;

    static RATIO_MIN = 1.0;
    static RATIO_MAX = 20.0;
    static RATIO_STEP = 0.5;
    static RATIO_DEFAULT = 4;

    static ATTACK_MIN = 0.0;
    static ATTACK_MAX = 1.0;
    static ATTACK_STEP = 0.01;
    static ATTACK_DEFAULT = 0.0;

    static RELEASE_MIN = 0.1;
    static RELEASE_MAX = 1.0;
    static RELEASE_STEP = 0.01;
    static RELEASE_DEFAULT = 0.25;

    static KNEE_MIN = 0.0;
    static KNEE_MAX = 40.0;
    static KNEE_STEP = 0.5;
    static KNEE_DEFAULT = 30;

    static ENABLED_DEFAULT = true;

    static validate({enabled, threshold, ratio, attack, release, knee}) {
        if (typeof enabled !== 'boolean') throw new Error(`Invalid config: enabled must be boolean (got ${typeof enabled})`);

        const assertFiniteNumberInRange = (name, value, min, max) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                throw new Error(`Invalid config: ${name} must be a finite number (got ${String(value)})`);
            }
            if (value < min || value > max) {
                throw new Error(`Invalid config: ${name} must be within [${min}, ${max}] (got ${value})`);
            }
        };

        assertFiniteNumberInRange('threshold', threshold, Config.THRESHOLD_MIN, Config.THRESHOLD_MAX);
        assertFiniteNumberInRange('ratio', ratio, Config.RATIO_MIN, Config.RATIO_MAX);
        assertFiniteNumberInRange('attack', attack, Config.ATTACK_MIN, Config.ATTACK_MAX);
        assertFiniteNumberInRange('release', release, Config.RELEASE_MIN, Config.RELEASE_MAX);
        assertFiniteNumberInRange('knee', knee, Config.KNEE_MIN, Config.KNEE_MAX);
    }

    constructor({enabled, threshold, ratio, attack, release, knee} = {}) {
        Config.validate({enabled, threshold, ratio, attack, release, knee});
        this.enabled = enabled;
        this.threshold = threshold;
        this.ratio = ratio;
        this.attack = attack;
        this.release = release;
        this.knee = knee;
        Object.freeze(this);
    }

    static createDefault() {
        return new Config({
            enabled: Config.ENABLED_DEFAULT,
            threshold: Config.THRESHOLD_DEFAULT,
            ratio: Config.RATIO_DEFAULT,
            attack: Config.ATTACK_DEFAULT,
            release: Config.RELEASE_DEFAULT,
            knee: Config.KNEE_DEFAULT,
        });
    }

    static fromStorageData(data) {
        const rawConfig = data?.[Config.CONFIG_STORAGE_KEY];
        const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

        return new Config({
            enabled: parseBoolean(source?.enabled, Config.ENABLED_DEFAULT),
            threshold: parseNumber(source?.threshold, Config.THRESHOLD_MIN, Config.THRESHOLD_MAX, Config.THRESHOLD_DEFAULT),
            ratio: parseNumber(source?.ratio, Config.RATIO_MIN, Config.RATIO_MAX, Config.RATIO_DEFAULT),
            attack: parseNumber(source?.attack, Config.ATTACK_MIN, Config.ATTACK_MAX, Config.ATTACK_DEFAULT),
            release: parseNumber(source?.release, Config.RELEASE_MIN, Config.RELEASE_MAX, Config.RELEASE_DEFAULT),
            knee: parseNumber(source?.knee, Config.KNEE_MIN, Config.KNEE_MAX, Config.KNEE_DEFAULT),
        });
    }

    toStorageData() {
        return {
            enabled: this.enabled,
            threshold: this.threshold,
            ratio: this.ratio,
            attack: this.attack,
            release: this.release,
            knee: this.knee,
        };
    }
}

class InputValueField {
    constructor({inputElement, valueTextElement, min, max, step, defaultValue}) {
        this.inputElement = inputElement;
        this.valueTextElement = valueTextElement;

        this.inputElement.min = String(min);
        this.inputElement.max = String(max);
        this.inputElement.step = String(step);
        this.set(defaultValue);

        this.inputElement.addEventListener('input', () => this.updateValueText());
    }

    updateValueText() {
        this.valueTextElement.textContent = this.inputElement.value;
    }

    set(nextValue) {
        this.inputElement.value = String(nextValue);
        this.updateValueText();
    }

    getNumber() {
        return parseFloat(this.inputElement.value);
    }

}
