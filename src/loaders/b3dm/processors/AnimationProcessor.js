import { B3dmError, B3DM_ERROR_CODES } from '../utils/B3dmConstants.js';

/**
 * Processor for animation data in B3DM files
 * Note: Most B3DM files don't contain animations, but this processor
 * handles them if they exist
 */
export class AnimationProcessor {
    constructor(options = {}) {
        this.options = {
            processAnimations: true,
            autoPlayAnimations: false,
            optimizeAnimations: true,
            ...options
        };
    }

    /**
     * Processes animations with B3DM-specific data
     * @param {BABYLON.AssetContainer} container - The asset container
     * @param {Object} context - Processing context with feature and batch data
     * @returns {Promise<void>}
     */
    async process(container, context) {
        if (!container || !container.animationGroups || container.animationGroups.length === 0) {
            return;
        }

        try {
            // Process each animation group
            for (const animationGroup of container.animationGroups) {
                // Optimize animations
                if (this.options.optimizeAnimations) {
                    this.optimizeAnimation(animationGroup);
                }
                
                // Auto-play animations if enabled
                if (this.options.autoPlayAnimations) {
                    animationGroup.play(true);
                }
            }
            
            // Store animation metadata
            container.metadata = container.metadata || {};
            container.metadata.hasAnimations = true;
            container.metadata.animationCount = container.animationGroups.length;
            
        } catch (error) {
            if (error instanceof B3dmError) {
                throw error;
            }
            
            throw new B3dmError(
                `Failed to process animations: ${error.message}`,
                B3DM_ERROR_CODES.PROCESSING_ERROR,
                { originalError: error }
            );
        }
    }

    /**
     * Optimizes an animation group
     * @param {BABYLON.AnimationGroup} animationGroup - The animation group to optimize
     * @private
     */
    optimizeAnimation(animationGroup) {
        // Set reasonable frame rate
        animationGroup.speedRatio = 1.0;
        
        // Optimize each animation in the group
        for (const targetedAnimation of animationGroup.targetedAnimations) {
            const animation = targetedAnimation.animation;
            
            // Optimize keyframes if there are too many
            if (animation.getKeys().length > 100) {
                animation.optimize(10); // Optimize with 10 degree threshold
            }
        }
    }
}