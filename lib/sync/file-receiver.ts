/**
 * File Receiver - SFTP & S3 Integration
 *
 * Handles receiving budget files from multiple sources:
 * - SFTP server (customer drops files via SFTP)
 * - S3 bucket (customer drops files in S3)
 * - Direct upload (customer uploads via SpendFlo UI)
 *
 * Supports file formats:
 * - CSV
 * - Excel (.xlsx, .xls)
 * - Google Sheets (via export URL)
 */

import { S3 } from 'aws-sdk';
import SFTPClient from 'ssh2-sftp-client';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface FileSource {
  type: 'sftp' | 's3' | 'upload';
  config: {
    // SFTP config
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
    remotePath?: string;

    // S3 config
    bucketName?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    prefix?: string;

    // Upload config
    localPath?: string;
  };
}

export interface ReceivedFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  receivedAt: Date;
  source: 'sftp' | 's3' | 'upload';
  metadata?: Record<string, any>;
}

export class FileReceiver {
  private s3Client?: S3;
  private sftpClient?: SFTPClient;
  private downloadDir: string;

  constructor(downloadDir: string = '/tmp/spendflo-budget-imports') {
    this.downloadDir = downloadDir;

    // Ensure download directory exists
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Poll for new files from configured source
   */
  async pollForNewFiles(source: FileSource, lastPollTime?: Date): Promise<ReceivedFile[]> {
    console.log(`[File Receiver] Polling for files from ${source.type}...`);

    switch (source.type) {
      case 'sftp':
        return await this.pollSFTP(source, lastPollTime);
      case 's3':
        return await this.pollS3(source, lastPollTime);
      case 'upload':
        return await this.pollLocalUpload(source, lastPollTime);
      default:
        throw new Error(`Unknown source type: ${source.type}`);
    }
  }

  /**
   * Poll SFTP server for new files
   */
  private async pollSFTP(source: FileSource, lastPollTime?: Date): Promise<ReceivedFile[]> {
    const { host, port = 22, username, password, privateKey, remotePath = '/' } = source.config;

    if (!host || !username) {
      throw new Error('SFTP requires host and username');
    }

    const sftp = new SFTPClient();
    const receivedFiles: ReceivedFile[] = [];

    try {
      // Connect to SFTP
      await sftp.connect({
        host,
        port,
        username,
        password,
        privateKey: privateKey ? Buffer.from(privateKey, 'utf-8') : undefined
      });

      console.log(`[File Receiver] Connected to SFTP: ${host}`);

      // List files in remote directory
      const fileList = await sftp.list(remotePath);

      for (const file of fileList) {
        // Skip directories
        if (file.type === 'd') continue;

        // Check if file is newer than last poll
        if (lastPollTime && file.modifyTime <= lastPollTime.getTime()) {
          continue;
        }

        // Only process budget files (CSV, Excel)
        if (!this.isSupportedFile(file.name)) {
          console.log(`[File Receiver] Skipping unsupported file: ${file.name}`);
          continue;
        }

        // Download file
        const remoteFilePath = path.join(remotePath, file.name);
        const localFilePath = path.join(this.downloadDir, `${Date.now()}_${file.name}`);

        console.log(`[File Receiver] Downloading: ${file.name}`);
        await sftp.get(remoteFilePath, localFilePath);

        receivedFiles.push({
          fileName: file.name,
          filePath: localFilePath,
          fileSize: file.size,
          receivedAt: new Date(file.modifyTime),
          source: 'sftp',
          metadata: {
            remotePath: remoteFilePath,
            modifyTime: file.modifyTime
          }
        });

        console.log(`[File Receiver] Downloaded: ${file.name} (${file.size} bytes)`);
      }

      await sftp.end();

    } catch (error: any) {
      console.error('[File Receiver] SFTP error:', error);
      await sftp.end().catch(() => {});
      throw new Error(`SFTP poll failed: ${error.message}`);
    }

    return receivedFiles;
  }

  /**
   * Poll S3 bucket for new files
   */
  private async pollS3(source: FileSource, lastPollTime?: Date): Promise<ReceivedFile[]> {
    const { bucketName, region = 'us-east-1', accessKeyId, secretAccessKey, prefix = '' } = source.config;

    if (!bucketName) {
      throw new Error('S3 requires bucketName');
    }

    // Initialize S3 client
    if (!this.s3Client || this.s3Client.config.credentials?.accessKeyId !== accessKeyId) {
      this.s3Client = new S3({
        region,
        accessKeyId,
        secretAccessKey,
        signatureVersion: 'v4'
      });
    }

    const receivedFiles: ReceivedFile[] = [];

    try {
      console.log(`[File Receiver] Listing S3 objects in ${bucketName}/${prefix}`);

      // List objects in bucket
      const response = await this.s3Client.listObjectsV2({
        Bucket: bucketName,
        Prefix: prefix
      }).promise();

      const objects = response.Contents || [];

      for (const obj of objects) {
        // Skip if no key
        if (!obj.Key) continue;

        // Check if file is newer than last poll
        if (lastPollTime && obj.LastModified && obj.LastModified <= lastPollTime) {
          continue;
        }

        // Only process budget files
        const fileName = path.basename(obj.Key);
        if (!this.isSupportedFile(fileName)) {
          console.log(`[File Receiver] Skipping unsupported file: ${fileName}`);
          continue;
        }

        // Download file from S3
        const localFilePath = path.join(this.downloadDir, `${Date.now()}_${fileName}`);

        console.log(`[File Receiver] Downloading from S3: ${obj.Key}`);
        const fileData = await this.s3Client.getObject({
          Bucket: bucketName,
          Key: obj.Key
        }).promise();

        fs.writeFileSync(localFilePath, fileData.Body as Buffer);

        receivedFiles.push({
          fileName,
          filePath: localFilePath,
          fileSize: obj.Size || 0,
          receivedAt: obj.LastModified || new Date(),
          source: 's3',
          metadata: {
            s3Key: obj.Key,
            s3Bucket: bucketName,
            etag: obj.ETag
          }
        });

        console.log(`[File Receiver] Downloaded from S3: ${fileName} (${obj.Size} bytes)`);
      }

    } catch (error: any) {
      console.error('[File Receiver] S3 error:', error);
      throw new Error(`S3 poll failed: ${error.message}`);
    }

    return receivedFiles;
  }

  /**
   * Poll local upload directory
   */
  private async pollLocalUpload(source: FileSource, lastPollTime?: Date): Promise<ReceivedFile[]> {
    const { localPath = this.downloadDir } = source.config;

    if (!fs.existsSync(localPath)) {
      console.warn(`[File Receiver] Local path does not exist: ${localPath}`);
      return [];
    }

    const receivedFiles: ReceivedFile[] = [];
    const files = fs.readdirSync(localPath);

    for (const fileName of files) {
      const filePath = path.join(localPath, fileName);
      const stats = fs.statSync(filePath);

      // Skip directories
      if (stats.isDirectory()) continue;

      // Check if file is newer than last poll
      if (lastPollTime && stats.mtime <= lastPollTime) {
        continue;
      }

      // Only process budget files
      if (!this.isSupportedFile(fileName)) {
        continue;
      }

      receivedFiles.push({
        fileName,
        filePath,
        fileSize: stats.size,
        receivedAt: stats.mtime,
        source: 'upload',
        metadata: {
          localPath: filePath
        }
      });

      console.log(`[File Receiver] Found local file: ${fileName} (${stats.size} bytes)`);
    }

    return receivedFiles;
  }

  /**
   * Parse received file and extract budget data
   */
  async parseFile(file: ReceivedFile): Promise<Array<Record<string, any>>> {
    console.log(`[File Receiver] Parsing file: ${file.fileName}`);

    const ext = path.extname(file.fileName).toLowerCase();

    switch (ext) {
      case '.csv':
        return this.parseCSV(file.filePath);
      case '.xlsx':
      case '.xls':
        return this.parseExcel(file.filePath);
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Parse CSV file
   */
  private async parseCSV(filePath: string): Promise<Array<Record<string, any>>> {
    return new Promise((resolve, reject) => {
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
        complete: (results) => {
          console.log(`[File Receiver] Parsed CSV: ${results.data.length} rows`);
          resolve(results.data as Array<Record<string, any>>);
        },
        error: (error: any) => {
          console.error('[File Receiver] CSV parse error:', error);
          reject(new Error(`CSV parse failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Parse Excel file
   */
  private async parseExcel(filePath: string): Promise<Array<Record<string, any>>> {
    try {
      // Read file as buffer first (Next.js serverless compatibility)
      const buffer = fs.readFileSync(filePath);

      // Parse buffer instead of using readFile
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Use first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Get raw array data first
        defval: '',
        blankrows: false
      }) as any[][];

      if (data.length === 0) {
        throw new Error('Excel file is empty');
      }

      // First row is headers
      const headers = data[0].map((h: any) => String(h).trim());
      const rows: Array<Record<string, any>> = [];

      for (let i = 1; i < data.length; i++) {
        const row: Record<string, any> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = data[i][j] !== undefined ? data[i][j] : '';
        }
        rows.push(row);
      }

      console.log(`[File Receiver] Parsed Excel: ${rows.length} rows`);
      return rows;

    } catch (error: any) {
      console.error('[File Receiver] Excel parse error:', error);
      throw new Error(`Excel parse failed: ${error.message}`);
    }
  }

  /**
   * Check if file is supported
   */
  private isSupportedFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ['.csv', '.xlsx', '.xls'].includes(ext);
  }

  /**
   * Clean up old downloaded files
   */
  async cleanupOldFiles(olderThanDays: number = 7): Promise<void> {
    const files = fs.readdirSync(this.downloadDir);
    const now = Date.now();
    const maxAge = olderThanDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const fileName of files) {
      const filePath = path.join(this.downloadDir, fileName);
      const stats = fs.statSync(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[File Receiver] Cleaned up ${deletedCount} old files`);
    }
  }
}

// Singleton instance
export const fileReceiver = new FileReceiver();
