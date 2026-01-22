/**
 * Manager PIN Authentication Module
 * 
 * Handles manager PIN verification and authentication for sensitive operations
 */

class ManagerPin {
    constructor(db, logger) {
        this.db = db;
        this.logger = logger || console;
    }

    /**
     * Verify manager PIN
     * @param {string} pin - Manager PIN to verify
     * @returns {Promise<Object>} - Verification result
     */
    async verifyPin(pin) {
        try {
            if (!this.db) {
                return {
                    success: false,
                    message: 'Database not initialized'
                };
            }

            const manager = await this.db.get(
                'SELECT * FROM users WHERE is_manager = 1 AND pin = ?',
                [pin]
            );

            if (manager) {
                return {
                    success: true,
                    userId: manager.id,
                    username: manager.name,
                    email: manager.email
                };
            }

            return {
                success: false,
                message: 'Invalid manager PIN'
            };
        } catch (error) {
            this.logger.error('Error verifying manager PIN:', error);
            return {
                success: false,
                message: 'PIN verification failed: ' + error.message
            };
        }
    }

    /**
     * Check if user is a manager
     * @param {number} userId - User ID to check
     * @returns {Promise<Object>} - Manager check result
     */
    async isManager(userId) {
        try {
            const user = await this.db.get(
                'SELECT is_manager FROM users WHERE id = ?',
                [userId]
            );

            if (user && user.is_manager) {
                return { isManager: true };
            }

            return { isManager: false };
        } catch (error) {
            this.logger.error('Error checking manager status:', error);
            throw error;
        }
    }

    /**
     * Get all managers
     * @returns {Promise<Array>} - List of managers
     */
    async getManagers() {
        try {
            return await this.db.all(
                'SELECT id, name, email FROM users WHERE is_manager = 1 ORDER BY name'
            );
        } catch (error) {
            this.logger.error('Error getting managers:', error);
            throw error;
        }
    }

    /**
     * Set/Update manager PIN
     * @param {number} userId - User ID
     * @param {string} newPin - New PIN
     * @param {number} updatedBy - User ID of who is updating
     * @returns {Promise<Object>} - Update result
     */
    async setPin(userId, newPin, updatedBy) {
        try {
            // Verify that the user is a manager
            const user = await this.db.get(
                'SELECT is_manager FROM users WHERE id = ?',
                [userId]
            );

            if (!user || !user.is_manager) {
                throw new Error('Only manager accounts can have PINs');
            }

            // Update the PIN
            await this.db.run(
                'UPDATE users SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newPin, userId]
            );

            // Log the change
            await this.db.run(
                'INSERT INTO user_activity_logs (user_id, action, details, created_by) VALUES (?, ?, ?, ?)',
                [
                    userId,
                    'UPDATE_PIN',
                    'PIN updated by user ' + updatedBy,
                    updatedBy
                ]
            );

            return {
                success: true,
                message: 'Manager PIN updated successfully'
            };
        } catch (error) {
            this.logger.error('Error setting manager PIN:', error);
            throw error;
        }
    }

    /**
     * Reset manager PIN (admin only)
     * @param {number} userId - User ID
     * @param {string} newPin - New PIN
     * @param {number} resetBy - User ID of admin resetting the PIN
     * @returns {Promise<Object>} - Reset result
     */
    async resetPin(userId, newPin, resetBy) {
        try {
            // Verify that the resetting user is an admin
            const admin = await this.db.get(
                'SELECT is_admin FROM users WHERE id = ?',
                [resetBy]
            );

            if (!admin || !admin.is_admin) {
                throw new Error('Only admin accounts can reset PINs');
            }

            // Update the PIN
            await this.db.run(
                'UPDATE users SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newPin, userId]
            );

            // Log the change
            await this.db.run(
                'INSERT INTO user_activity_logs (user_id, action, details, created_by) VALUES (?, ?, ?, ?)',
                [
                    userId,
                    'RESET_PIN',
                    'PIN reset by admin ' + resetBy,
                    resetBy
                ]
            );

            return {
                success: true,
                message: 'Manager PIN reset successfully'
            };
        } catch (error) {
            this.logger.error('Error resetting manager PIN:', error);
            throw error;
        }
    }

    /**
     * Check if PIN requires change (first login)
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - PIN status
     */
    async requiresPinChange(userId) {
        try {
            const user = await this.db.get(
                'SELECT pin, pin_changed FROM users WHERE id = ?',
                [userId]
            );

            if (user && !user.pin_changed) {
                return { requiresChange: true };
            }

            return { requiresChange: false };
        } catch (error) {
            this.logger.error('Error checking PIN change status:', error);
            throw error;
        }
    }

    /**
     * Mark PIN as changed
     * @param {number} userId - User ID
     * @returns {Promise<Object>} - Result
     */
    async markPinChanged(userId) {
        try {
            await this.db.run(
                'UPDATE users SET pin_changed = 1 WHERE id = ?',
                [userId]
            );

            return { success: true, message: 'PIN change acknowledged' };
        } catch (error) {
            this.logger.error('Error marking PIN as changed:', error);
            throw error;
        }
    }
}

module.exports = ManagerPin;
