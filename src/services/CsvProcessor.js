/**
 * CSV Processing Service
 * Handles reading and parsing CSV files for certificate generation
 */

import fs from 'fs';
import { parse } from 'csv-parse';

export class CsvProcessor {
  constructor(config) {
    this.config = config;
  }

  /**
   * Process CSV file and return participant data
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Array>} Array of participant data
   */
  async processCsvFile(filePath) {
    const csvSettings = this.config.csvSettings;
    
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath, { encoding: csvSettings.encoding })
        .pipe(
          parse({
            delimiter: csvSettings.delimiter,
            from_line: csvSettings.skipFirstRow ? 2 : 1,
            encoding: csvSettings.encoding,
          })
        )
        .on("data", (row) => {
          results.push(row);
        })
        .on("end", () => {
          resolve(results);
          if (this.config.processingSettings.showProgress) {
            console.log(`✅ CSV file successfully processed: ${results.length} records`);
          }
        })
        .on("error", (error) => {
          console.error('❌ CSV processing error:', error);
          reject(error);
        });
    });
  }

  /**
   * Extract participant data from CSV row
   * @param {Array} row - CSV row data
   * @returns {Object} Participant object {name, position}
   */
  extractParticipantData(row) {
    const csvSettings = this.config.csvSettings;
    
    return {
      name: row[csvSettings.nameColumn] || '',
      position: row[csvSettings.positionColumn] || ''
    };
  }

  /**
   * Validate participant data
   * @param {Object} participant - Participant data {name, position}
   * @returns {boolean} True if valid
   */
  validateParticipantData(participant) {
    if (!this.config.processingSettings.validateInput) {
      return true;
    }

    if (!participant.name || participant.name.trim().length === 0) {
      console.warn(`⚠️ Skipping row with empty name: ${JSON.stringify(participant)}`);
      return false;
    }

    if (!participant.position || participant.position.trim().length === 0) {
      console.warn(`⚠️ Row has empty position for ${participant.name}`);
      // Don't skip, just warn - position can be empty
    }

    return true;
  }

  /**
   * Process CSV file and return validated participant data
   * @param {string} filePath - Path to CSV file
   * @returns {Promise<Array>} Array of validated participant objects
   */
  async getParticipants(filePath) {
    try {
      const rawData = await this.processCsvFile(filePath);
      const participants = [];

      for (const row of rawData) {
        const participant = this.extractParticipantData(row);
        
        if (this.validateParticipantData(participant)) {
          participants.push(participant);
        }
      }

      if (this.config.processingSettings.showProgress) {
        console.log(`📊 Processed ${participants.length} valid participants from CSV`);
      }

      return participants;
    } catch (error) {
      console.error('❌ Error processing CSV file:', error);
      throw error;
    }
  }
}

export default CsvProcessor;
