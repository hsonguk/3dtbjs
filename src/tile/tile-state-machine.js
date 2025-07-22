/**
 * State machine for managing tile lifecycle
 */

import { TILE_STATE } from '../config/tile-config.js';

/**
 * State machine for managing tile loading and rendering states
 */
export class TileStateMachine {
    constructor(tile) {
        this.tile = tile;
        this.state = TILE_STATE.UNLOADED;
        this.previousState = null;
        this.stateHistory = [TILE_STATE.UNLOADED];
        this.listeners = new Map();
    }

    /**
     * Gets the current state
     * @returns {string} Current state
     */
    getState() {
        return this.state;
    }

    /**
     * Gets the previous state
     * @returns {string|null} Previous state
     */
    getPreviousState() {
        return this.previousState;
    }

    /**
     * Checks if the tile is in a specific state
     * @param {string} state - State to check
     * @returns {boolean} True if in the specified state
     */
    isState(state) {
        return this.state === state;
    }

    /**
     * Checks if the tile can transition to a new state
     * @param {string} newState - The target state
     * @returns {boolean} True if transition is allowed
     */
    canTransition(newState) {
        const transitions = this.getAllowedTransitions();
        return transitions.includes(newState);
    }

    /**
     * Transitions to a new state
     * @param {string} newState - The target state
     * @param {Object} [data] - Optional data to pass with the transition
     * @returns {boolean} True if transition was successful
     */
    transition(newState, data = null) {
        if (!this.canTransition(newState)) {
            console.warn(`Invalid state transition from ${this.state} to ${newState} for tile ${this.tile.uuid}`);
            return false;
        }

        const oldState = this.state;
        this.previousState = oldState;
        this.state = newState;
        this.stateHistory.push(newState);

        // Keep history limited
        if (this.stateHistory.length > 10) {
            this.stateHistory.shift();
        }

        // Notify listeners
        this.notifyListeners(oldState, newState, data);

        return true;
    }

    /**
     * Gets allowed transitions from the current state
     * @returns {Array<string>} Array of allowed target states
     */
    getAllowedTransitions() {
        const transitions = {
            [TILE_STATE.UNLOADED]: [TILE_STATE.LOADING, TILE_STATE.DISPOSED],
            [TILE_STATE.LOADING]: [TILE_STATE.LOADED, TILE_STATE.FAILED, TILE_STATE.DISPOSED],
            [TILE_STATE.LOADED]: [TILE_STATE.READY, TILE_STATE.FAILED, TILE_STATE.DISPOSED],
            [TILE_STATE.READY]: [TILE_STATE.DISPOSED, TILE_STATE.LOADING], // Can reload
            [TILE_STATE.FAILED]: [TILE_STATE.LOADING, TILE_STATE.DISPOSED], // Can retry
            [TILE_STATE.DISPOSED]: [] // Terminal state
        };

        return transitions[this.state] || [];
    }

    /**
     * Adds a state change listener
     * @param {Function} callback - Callback function (oldState, newState, data) => void
     * @returns {string} Listener ID for removal
     */
    addListener(callback) {
        const id = Math.random().toString(36).substr(2, 9);
        this.listeners.set(id, callback);
        return id;
    }

    /**
     * Removes a state change listener
     * @param {string} listenerId - The listener ID to remove
     */
    removeListener(listenerId) {
        this.listeners.delete(listenerId);
    }

    /**
     * Notifies all listeners of a state change
     * @param {string} oldState - The previous state
     * @param {string} newState - The new state
     * @param {Object} data - Optional data
     * @private
     */
    notifyListeners(oldState, newState, data) {
        for (const callback of this.listeners.values()) {
            try {
                callback(oldState, newState, data);
            } catch (error) {
                console.error('Error in state change listener:', error);
            }
        }
    }

    /**
     * Gets the state history
     * @returns {Array<string>} Array of states in chronological order
     */
    getStateHistory() {
        return [...this.stateHistory];
    }

    /**
     * Resets the state machine to unloaded
     */
    reset() {
        this.previousState = this.state;
        this.state = TILE_STATE.UNLOADED;
        this.stateHistory = [TILE_STATE.UNLOADED];
        this.notifyListeners(this.previousState, this.state, { reset: true });
    }

    /**
     * Checks if the tile is ready for rendering
     * @returns {boolean} True if ready
     */
    isReady() {
        return this.state === TILE_STATE.READY;
    }

    /**
     * Checks if the tile is loading
     * @returns {boolean} True if loading
     */
    isLoading() {
        return this.state === TILE_STATE.LOADING;
    }

    /**
     * Checks if the tile has failed
     * @returns {boolean} True if failed
     */
    isFailed() {
        return this.state === TILE_STATE.FAILED;
    }

    /**
     * Checks if the tile is disposed
     * @returns {boolean} True if disposed
     */
    isDisposed() {
        return this.state === TILE_STATE.DISPOSED;
    }

    /**
     * Disposes of the state machine
     */
    dispose() {
        this.transition(TILE_STATE.DISPOSED);
        this.listeners.clear();
    }
}