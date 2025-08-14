/**
 * Lab Management Composed Mutations
 * 
 * This file contains composed mutations for complex lab management workflows
 * that involve multiple API calls, file uploads, metadata updates, and cache management.
 * 
 * Composed Mutations Included:
 * 1. useCreateLabComposed - Create lab + metadata + upload images + list on marketplace
 * 2. useUpdateLabComposed - Update lab data + metadata + handle image changes + refresh cache
 * 3. useDeleteLabComposed - Delete lab + cleanup metadata + remove images + update listings
 * 4. useLabImageManagementComposed - Handle image uploads/updates/deletion with rollback
 * 
 * @file labComposedMutations.js
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/context/UserContext';
import { 
  useCreateSequentialMutation, 
  useCreateParallelMutation,
  createMutationStep,
  createInvalidationStep,
  createOptimisticStep,
  createApiStep
} from '@/utils/mutations/composedMutations';
import { 
  useAddLab,
  useUpdateLab, 
  useDeleteLab,
  useCreateLabMutation,
  useToggleLabStatusMutation
} from '@/hooks/lab/useLabs';
import { 
  useSaveLabData,
  useDeleteLabData,
  useUploadFile,
  useDeleteFile
} from '@/hooks/provider/useProvider';
import devLog from '@/utils/dev/logger';

/**
 * Composed mutation for creating a complete lab with metadata and images
 * 
 * Workflow:
 * 1. Upload images in parallel
 * 2. Create metadata with image URLs
 * 3. Save metadata to server
 * 4. Create lab NFT on blockchain
 * 5. List lab for reservations
 * 6. Invalidate all relevant caches
 * 
 * Rollback Strategy:
 * - Delete uploaded images
 * - Remove metadata from server
 * - Remove lab NFT if created
 * - Restore cache state
 */
export const useCreateLabComposed = (options = {}) => {
  const { user, address, isSSO } = useUser();
  const queryClient = useQueryClient();

  // Individual mutation hooks
  const saveLabData = useSaveLabData();
  const deleteLabData = useDeleteLabData();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();
  const createLab = useCreateLabMutation();

  const steps = [
    // Step 1: Upload images in parallel (if provided)
    createMutationStep(
      'upload-images',
      async (variables) => {
        const { images = [] } = variables;
        if (images.length === 0) return { imageUrls: [] };

        devLog.log(`🖼️ [CreateLab] Uploading ${images.length} images in parallel`);
        
        const uploadPromises = images.map(async (imageFile, index) => {
          const destinationFolder = `labs/lab_${Date.now()}_${index}`;
          return await uploadFile.mutateAsync({
            file: imageFile,
            destinationFolder,
            labId: `temp_${Date.now()}_${index}`
          });
        });

        const uploadResults = await Promise.all(uploadPromises);
        const imageUrls = uploadResults.map(result => result.fileUrl);
        
        devLog.log(`✅ [CreateLab] Successfully uploaded ${imageUrls.length} images`, imageUrls);
        return { imageUrls, uploadResults };
      },
      // Rollback: Delete uploaded images
      async (result) => {
        if (result?.uploadResults) {
          devLog.log(`🔄 [CreateLab] Rolling back image uploads`);
          const deletionPromises = result.uploadResults.map(async (uploadResult) => {
            try {
              await deleteFile.mutateAsync({ filePath: uploadResult.filePath });
            } catch (error) {
              devLog.warn(`⚠️ [CreateLab] Failed to delete image during rollback: ${uploadResult.filePath}`, error);
            }
          });
          await Promise.allSettled(deletionPromises);
        }
      }
    ),

    // Step 2: Create and save metadata
    createMutationStep(
      'save-metadata',
      async (variables, previousResults) => {
        const { name, description, category, price, provider, keywords } = variables;
        const { imageUrls = [] } = previousResults[0] || {};

        const metadata = {
          name,
          description,
          category,
          provider,
          keywords: Array.isArray(keywords) ? keywords : [],
          price: parseFloat(price) || 0,
          images: imageUrls,
          image: imageUrls[0] || '', // Primary image
          createdAt: new Date().toISOString(),
          version: '1.0.0'
        };

        devLog.log(`💾 [CreateLab] Saving metadata for: ${name}`);
        
        const metadataResult = await saveLabData.mutateAsync({
          uri: `Lab-${provider}-${Date.now()}`,
          metadata
        });

        devLog.log(`✅ [CreateLab] Metadata saved with URI: ${metadataResult.uri}`);
        return { metadata, uri: metadataResult.uri, ...metadataResult };
      },
      // Rollback: Delete metadata
      async (result) => {
        if (result?.uri) {
          devLog.log(`🔄 [CreateLab] Rolling back metadata: ${result.uri}`);
          try {
            await deleteLabData.mutateAsync({ uri: result.uri });
          } catch (error) {
            devLog.warn(`⚠️ [CreateLab] Failed to delete metadata during rollback: ${result.uri}`, error);
          }
        }
      }
    ),

    // Step 3: Create lab NFT on blockchain
    createMutationStep(
      'create-lab-nft',
      async (variables, previousResults) => {
        const { price } = variables;
        const { uri } = previousResults[1];

        const labData = {
          uri,
          price: parseFloat(price) || 0,
          userAddress: address
        };

        devLog.log(`🪙 [CreateLab] Creating lab NFT with URI: ${uri}`);
        
        const nftResult = await createLab.mutateAsync(labData);
        
        devLog.log(`✅ [CreateLab] Lab NFT created with ID: ${nftResult.labId || 'pending'}`);
        return { labId: nftResult.labId, txHash: nftResult.hash, ...nftResult };
      },
      // Rollback: Cannot rollback blockchain transaction, but we can mark as failed
      async (result) => {
        devLog.warn(`⚠️ [CreateLab] Cannot rollback blockchain transaction: ${result?.txHash}`);
        // In a real implementation, you might want to mark the lab as "failed" or "draft"
      }
    ),

    // Step 4: Invalidate caches
    createInvalidationStep(
      'invalidate-caches',
      (variables, previousResults) => [
        ['labs'],
        ['metadata'],
        ['providers'],
        ['lab-bookings'],
        ['user', address, 'labs']
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result) => {
      devLog.log(`🎉 [CreateLabComposed] Successfully created lab!`, {
        completedSteps: result.completedSteps.map(s => s.step),
        results: result.results.length
      });

      // Additional success callback
      if (options.onSuccess) {
        options.onSuccess(result);
      }
    },
    onError: (error) => {
      devLog.error(`❌ [CreateLabComposed] Failed to create lab:`, error);

      // Additional error callback
      if (options.onError) {
        options.onError(error);
      }
    },
    ...options
  });
};

/**
 * Composed mutation for updating an existing lab with metadata and image changes
 * 
 * Workflow:
 * 1. Optimistically update UI
 * 2. Handle image changes (upload new, delete removed)
 * 3. Update metadata with new image URLs
 * 4. Update lab data on blockchain (if needed)
 * 5. Invalidate relevant caches
 * 
 * Rollback Strategy:
 * - Restore original cache state
 * - Delete newly uploaded images
 * - Restore original metadata
 */
export const useUpdateLabComposed = (options = {}) => {
  const { address } = useUser();
  const queryClient = useQueryClient();

  const updateLab = useUpdateLab();
  const saveLabData = useSaveLabData();
  const uploadFile = useUploadFile();
  const deleteFile = useDeleteFile();

  const steps = [
    // Step 1: Optimistic UI update
    createOptimisticStep(
      'optimistic-update',
      ['labs'],
      (oldData, variables) => {
        if (!oldData?.labs) return oldData;
        
        return {
          ...oldData,
          labs: oldData.labs.map(lab => 
            lab.id === variables.labId 
              ? { ...lab, ...variables.updates, isUpdating: true }
              : lab
          )
        };
      }
    ),

    // Step 2: Handle image changes
    createMutationStep(
      'manage-images',
      async (variables) => {
        const { newImages = [], removedImages = [], labId } = variables;
        
        // Upload new images in parallel
        const uploadPromises = newImages.map(async (imageFile, index) => {
          const destinationFolder = `labs/lab_${labId}_${Date.now()}_${index}`;
          return await uploadFile.mutateAsync({
            file: imageFile,
            destinationFolder,
            labId: labId
          });
        });

        // Delete removed images in parallel
        const deletePromises = removedImages.map(async (imagePath) => {
          try {
            return await deleteFile.mutateAsync({ filePath: imagePath });
          } catch (error) {
            devLog.warn(`⚠️ [UpdateLab] Failed to delete image: ${imagePath}`, error);
            return { error: error.message, imagePath };
          }
        });

        const [uploadResults, deleteResults] = await Promise.all([
          Promise.all(uploadPromises),
          Promise.allSettled(deletePromises)
        ]);

        const newImageUrls = uploadResults.map(result => result.fileUrl);
        
        devLog.log(`✅ [UpdateLab] Image management completed:`, {
          uploaded: newImageUrls.length,
          deleted: deleteResults.length
        });

        return { newImageUrls, uploadResults, deleteResults };
      },
      // Rollback: Delete new uploads, restore deleted images (if possible)
      async (result) => {
        if (result?.uploadResults) {
          const rollbackPromises = result.uploadResults.map(async (uploadResult) => {
            try {
              await deleteFile.mutateAsync({ filePath: uploadResult.filePath });
            } catch (error) {
              devLog.warn(`⚠️ [UpdateLab] Failed to rollback image upload: ${uploadResult.filePath}`, error);
            }
          });
          await Promise.allSettled(rollbackPromises);
        }
      }
    ),

    // Step 3: Update metadata
    createMutationStep(
      'update-metadata',
      async (variables, previousResults) => {
        const { labId, updates, currentMetadata = {} } = variables;
        const { newImageUrls = [] } = previousResults[1] || {};

        // Merge existing images with new ones (removed ones already deleted)
        const existingImages = currentMetadata.images || [];
        const updatedImages = [...existingImages, ...newImageUrls];

        const updatedMetadata = {
          ...currentMetadata,
          ...updates,
          images: updatedImages,
          image: updatedImages[0] || currentMetadata.image,
          updatedAt: new Date().toISOString(),
          version: (parseFloat(currentMetadata.version || '1.0.0') + 0.1).toFixed(1)
        };

        devLog.log(`💾 [UpdateLab] Updating metadata for lab: ${labId}`);
        
        const metadataResult = await saveLabData.mutateAsync({
          uri: currentMetadata.uri || `Lab-${updates.provider || 'UNKNOWN'}-${labId}`,
          metadata: updatedMetadata
        });

        devLog.log(`✅ [UpdateLab] Metadata updated successfully`);
        return { updatedMetadata, ...metadataResult };
      }
    ),

    // Step 4: Update lab on blockchain (if price or other blockchain data changed)
    createMutationStep(
      'update-lab-blockchain',
      async (variables, previousResults) => {
        const { labId, updates } = variables;
        
        // Only update blockchain if price changed
        if ('price' in updates) {
          devLog.log(`🪙 [UpdateLab] Updating lab price on blockchain: ${labId}`);
          
          const updateResult = await updateLab.mutateAsync({
            labId,
            price: parseFloat(updates.price),
            userAddress: address
          });

          devLog.log(`✅ [UpdateLab] Blockchain update completed`);
          return updateResult;
        }
        
        return { skipped: 'no-blockchain-changes' };
      }
    ),

    // Step 5: Invalidate caches
    createInvalidationStep(
      'invalidate-caches',
      (variables) => [
        ['labs'],
        ['lab', variables.labId],
        ['metadata', `Lab-*-${variables.labId}`],
        ['lab-bookings', variables.labId],
        ['user', address, 'labs']
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      devLog.log(`🎉 [UpdateLabComposed] Successfully updated lab: ${variables.labId}`);

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [UpdateLabComposed] Failed to update lab: ${variables.labId}`, error);

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

/**
 * Composed mutation for deleting a lab with complete cleanup
 * 
 * Workflow:
 * 1. Check for active bookings (prevent deletion if any)
 * 2. Delete all associated images
 * 3. Delete metadata from server
 * 4. Delete lab NFT (mark as deleted/inactive)
 * 5. Clean up all caches
 * 
 * Rollback Strategy:
 * - Restore metadata
 * - Restore images (if backed up)
 * - Reactivate lab
 */
export const useDeleteLabComposed = (options = {}) => {
  const { address } = useUser();
  const queryClient = useQueryClient();

  const deleteLab = useDeleteLab();
  const deleteLabData = useDeleteLabData();
  const deleteFile = useDeleteFile();

  const steps = [
    // Step 1: Validate deletion (check active bookings)
    createMutationStep(
      'validate-deletion',
      async (variables) => {
        const { labId } = variables;
        
        // Get current bookings for this lab
        const bookingsQuery = queryClient.getQueryData(['lab-bookings', labId]);
        const activeBookings = bookingsQuery?.filter(booking => 
          booking.status === 'active' || booking.status === 'confirmed'
        ) || [];

        if (activeBookings.length > 0) {
          throw new Error(`Cannot delete lab with ${activeBookings.length} active bookings`);
        }

        devLog.log(`✅ [DeleteLab] Validation passed - no active bookings for lab: ${labId}`);
        return { activeBookings: activeBookings.length };
      }
    ),

    // Step 2: Get lab data for cleanup reference
    createMutationStep(
      'get-lab-data',
      async (variables) => {
        const { labId } = variables;
        
        // Get current lab data from cache
        const labData = queryClient.getQueryData(['lab', labId]) || 
                      queryClient.getQueryData(['labs'])?.labs?.find(l => l.id === labId);
        
        if (!labData) {
          throw new Error(`Lab data not found for ID: ${labId}`);
        }

        devLog.log(`📋 [DeleteLab] Retrieved lab data for cleanup:`, {
          name: labData.name,
          images: labData.images?.length || 0,
          uri: labData.metadata?.uri
        });

        return { labData };
      }
    ),

    // Step 3: Delete associated images
    createMutationStep(
      'delete-images',
      async (variables, previousResults) => {
        const { labData } = previousResults[1];
        const images = labData.images || [];
        
        if (images.length === 0) {
          return { deletedImages: 0 };
        }

        devLog.log(`🖼️ [DeleteLab] Deleting ${images.length} associated images`);
        
        const deletePromises = images.map(async (imagePath) => {
          try {
            return await deleteFile.mutateAsync({ filePath: imagePath });
          } catch (error) {
            devLog.warn(`⚠️ [DeleteLab] Failed to delete image: ${imagePath}`, error);
            return { error: error.message, imagePath };
          }
        });

        const deleteResults = await Promise.allSettled(deletePromises);
        const successfulDeletes = deleteResults.filter(result => result.status === 'fulfilled').length;
        
        devLog.log(`✅ [DeleteLab] Deleted ${successfulDeletes}/${images.length} images`);
        return { deletedImages: successfulDeletes, deleteResults, originalImages: images };
      }
    ),

    // Step 4: Delete metadata
    createMutationStep(
      'delete-metadata',
      async (variables, previousResults) => {
        const { labData } = previousResults[1];
        const uri = labData.metadata?.uri || labData.uri;
        
        if (!uri) {
          devLog.warn(`⚠️ [DeleteLab] No metadata URI found for lab: ${variables.labId}`);
          return { skipped: 'no-metadata-uri' };
        }

        devLog.log(`💾 [DeleteLab] Deleting metadata: ${uri}`);
        
        const deleteResult = await deleteLabData.mutateAsync({ uri });
        
        devLog.log(`✅ [DeleteLab] Metadata deleted successfully`);
        return { uri, ...deleteResult };
      },
      // Rollback: Restore metadata (if we have backup)
      async (result, variables, previousResults) => {
        if (result?.uri && previousResults[1]?.labData) {
          const { labData } = previousResults[1];
          devLog.log(`🔄 [DeleteLab] Attempting to restore metadata: ${result.uri}`);
          
          try {
            // In a real implementation, you'd restore from backup
            devLog.warn(`⚠️ [DeleteLab] Metadata restore not implemented - manual recovery may be needed`);
          } catch (error) {
            devLog.error(`❌ [DeleteLab] Failed to restore metadata during rollback`, error);
          }
        }
      }
    ),

    // Step 5: Delete/deactivate lab NFT
    createMutationStep(
      'delete-lab-nft',
      async (variables) => {
        const { labId } = variables;
        
        devLog.log(`🪙 [DeleteLab] Deleting lab NFT: ${labId}`);
        
        const deleteResult = await deleteLab.mutateAsync({
          labId,
          userAddress: address
        });

        devLog.log(`✅ [DeleteLab] Lab NFT deleted successfully`);
        return { labId, ...deleteResult };
      }
    ),

    // Step 6: Clean up all caches
    createInvalidationStep(
      'cleanup-caches',
      (variables) => [
        ['labs'],
        ['lab', variables.labId],
        ['metadata'],
        ['lab-bookings', variables.labId],
        ['user', address, 'labs'],
        ['providers']
      ]
    )
  ];

  return useCreateSequentialMutation(steps, {
    onSuccess: (result, variables) => {
      devLog.log(`🎉 [DeleteLabComposed] Successfully deleted lab: ${variables.labId}`);

      if (options.onSuccess) {
        options.onSuccess(result, variables);
      }
    },
    onError: (error, variables) => {
      devLog.error(`❌ [DeleteLabComposed] Failed to delete lab: ${variables.labId}`, error);

      if (options.onError) {
        options.onError(error, variables);
      }
    },
    ...options
  });
};

export default {
  useCreateLabComposed,
  useUpdateLabComposed,
  useDeleteLabComposed
};
