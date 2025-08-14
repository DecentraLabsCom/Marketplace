/**
 * Composed Mutations Utilities
 * 
 * This file contains utility functions and patterns for creating composed mutations
 * in React Query. Composed mutations orchestrate multiple API calls, cache updates,
 * and complex state management operations as single atomic operations.
 * 
 * Architecture Patterns:
 * 1. Sequential Execution - Operations that must happen in specific order
 * 2. Parallel with Dependency - Operations that can run concurrently but have dependencies
 * 3. Rollback Patterns - Operations that can be reversed if later steps fail
 * 4. Optimistic Updates - UI updates before server confirmation
 * 
 * @file composedMutations.js
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import devLog from '@/utils/dev/logger';

/**
 * Base class for composed mutations
 * Provides common patterns for orchestrating multiple mutations
 */
export class ComposedMutation {
  constructor(queryClient, options = {}) {
    this.queryClient = queryClient;
    this.options = options;
    this.rollbackActions = [];
    this.completedSteps = [];
  }

  /**
   * Add a rollback action to be executed if the mutation fails
   */
  addRollback(rollbackFn, stepName) {
    this.rollbackActions.unshift({ fn: rollbackFn, step: stepName });
  }

  /**
   * Mark a step as completed for rollback purposes
   */
  markStepCompleted(stepName, rollbackData = null) {
    this.completedSteps.push({ step: stepName, data: rollbackData });
  }

  /**
   * Execute rollback actions in reverse order
   */
  async executeRollback(error, context = {}) {
    devLog.warn(`🔄 [ComposedMutation] Executing rollback for ${this.rollbackActions.length} actions`, {
      error: error.message,
      completedSteps: this.completedSteps.map(s => s.step),
      context
    });

    const rollbackResults = [];

    for (const { fn, step } of this.rollbackActions) {
      try {
        devLog.log(`🔄 [ComposedMutation] Rolling back step: ${step}`);
        const result = await fn();
        rollbackResults.push({ step, success: true, result });
        devLog.log(`✅ [ComposedMutation] Rollback successful for: ${step}`);
      } catch (rollbackError) {
        devLog.error(`❌ [ComposedMutation] Rollback failed for: ${step}`, rollbackError);
        rollbackResults.push({ step, success: false, error: rollbackError.message });
      }
    }

    return rollbackResults;
  }

  /**
   * Optimistically update cache before mutation
   */
  optimisticUpdate(queryKey, updateFn) {
    const previousData = this.queryClient.getQueryData(queryKey);
    
    // Apply optimistic update
    this.queryClient.setQueryData(queryKey, updateFn);
    
    // Add rollback to restore previous data
    this.addRollback(() => {
      this.queryClient.setQueryData(queryKey, previousData);
    }, `optimistic-rollback-${queryKey.join('.')}`);

    return previousData;
  }

  /**
   * Invalidate multiple query keys with optional delay
   */
  async invalidateQueries(queryKeys, delay = 0) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const invalidationPromises = queryKeys.map(async (queryKey) => {
      try {
        await this.queryClient.invalidateQueries({ 
          queryKey, 
          refetchType: 'active' 
        });
        devLog.log(`✅ [ComposedMutation] Invalidated cache: ${queryKey.join('.')}`);
      } catch (error) {
        devLog.error(`❌ [ComposedMutation] Failed to invalidate: ${queryKey.join('.')}`, error);
      }
    });

    await Promise.all(invalidationPromises);
  }
}

/**
 * Create a sequential composed mutation
 * Steps execute one after another, with full rollback on failure
 */
export function useCreateSequentialMutation(steps, options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      const mutation = new ComposedMutation(queryClient, options);
      const results = [];

      try {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          devLog.log(`⏳ [SequentialMutation] Executing step ${i + 1}/${steps.length}: ${step.name}`);

          // Execute step with variables and previous results
          const stepResult = await step.execute(variables, results, mutation);
          results.push(stepResult);
          
          mutation.markStepCompleted(step.name, stepResult);
          devLog.log(`✅ [SequentialMutation] Completed step: ${step.name}`);
        }

        devLog.log(`✅ [SequentialMutation] All ${steps.length} steps completed successfully`);
        return {
          success: true,
          results,
          completedSteps: mutation.completedSteps
        };

      } catch (error) {
        devLog.error(`❌ [SequentialMutation] Step failed, executing rollback:`, error);
        
        const rollbackResults = await mutation.executeRollback(error, { 
          variables, 
          results, 
          failedAt: mutation.completedSteps.length 
        });

        throw new Error(`Sequential mutation failed: ${error.message}`, {
          cause: error,
          rollbackResults,
          completedSteps: mutation.completedSteps
        });
      }
    },
    ...options
  });
}

/**
 * Create a parallel composed mutation
 * Steps that can execute concurrently, with dependency management
 */
export function useCreateParallelMutation(stepGroups, options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables) => {
      const mutation = new ComposedMutation(queryClient, options);
      const allResults = [];

      try {
        // Execute step groups sequentially, but steps within each group in parallel
        for (let groupIndex = 0; groupIndex < stepGroups.length; groupIndex++) {
          const group = stepGroups[groupIndex];
          devLog.log(`⏳ [ParallelMutation] Executing group ${groupIndex + 1}/${stepGroups.length} with ${group.steps.length} parallel steps`);

          // Execute all steps in the current group in parallel
          const groupPromises = group.steps.map(async (step) => {
            devLog.log(`⏳ [ParallelMutation] Starting parallel step: ${step.name}`);
            const stepResult = await step.execute(variables, allResults, mutation);
            mutation.markStepCompleted(step.name, stepResult);
            devLog.log(`✅ [ParallelMutation] Completed parallel step: ${step.name}`);
            return stepResult;
          });

          const groupResults = await Promise.all(groupPromises);
          allResults.push(...groupResults);
          
          devLog.log(`✅ [ParallelMutation] Completed group ${groupIndex + 1} with ${groupResults.length} results`);
        }

        devLog.log(`✅ [ParallelMutation] All ${stepGroups.length} groups completed successfully`);
        return {
          success: true,
          results: allResults,
          completedSteps: mutation.completedSteps
        };

      } catch (error) {
        devLog.error(`❌ [ParallelMutation] Group failed, executing rollback:`, error);
        
        const rollbackResults = await mutation.executeRollback(error, { 
          variables, 
          results: allResults,
          failedAt: mutation.completedSteps.length 
        });

        throw new Error(`Parallel mutation failed: ${error.message}`, {
          cause: error,
          rollbackResults,
          completedSteps: mutation.completedSteps
        });
      }
    },
    ...options
  });
}

/**
 * Utility function to create a mutation step
 */
export function createMutationStep(name, executeFn, rollbackFn = null) {
  return {
    name,
    execute: async (variables, previousResults, mutation) => {
      const result = await executeFn(variables, previousResults);
      
      // Add rollback if provided
      if (rollbackFn) {
        mutation.addRollback(() => rollbackFn(result, variables), `rollback-${name}`);
      }

      return result;
    }
  };
}

/**
 * Utility for cache invalidation step
 */
export function createInvalidationStep(name, queryKeysGetter) {
  return createMutationStep(
    name,
    async (variables, previousResults, mutation) => {
      const queryKeys = typeof queryKeysGetter === 'function' 
        ? queryKeysGetter(variables, previousResults)
        : queryKeysGetter;

      await mutation.invalidateQueries(queryKeys);
      return { invalidatedKeys: queryKeys };
    }
  );
}

/**
 * Utility for optimistic update step
 */
export function createOptimisticStep(name, queryKey, updateFn) {
  return createMutationStep(
    name,
    (variables, previousResults, mutation) => {
      const previousData = mutation.optimisticUpdate(queryKey, (oldData) => 
        updateFn(oldData, variables, previousResults)
      );
      return { queryKey, previousData };
    }
  );
}

/**
 * Utility for API call step
 */
export function createApiStep(name, apiFn, rollbackApiFn = null) {
  return createMutationStep(
    name,
    async (variables, previousResults) => {
      const result = await apiFn(variables, previousResults);
      return result;
    },
    rollbackApiFn
  );
}

export default {
  ComposedMutation,
  useCreateSequentialMutation,
  useCreateParallelMutation,
  createMutationStep,
  createInvalidationStep,
  createOptimisticStep,
  createApiStep
};
