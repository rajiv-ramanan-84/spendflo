declare module 'ssh2-sftp-client' {
  export default class SFTPClient {
    connect(config: any): Promise<void>;
    list(remoteDir: string): Promise<any[]>;
    get(remotePath: string, localPath?: string): Promise<string | Buffer>;
    fastGet(remotePath: string, localPath: string): Promise<void>;
    put(localPath: string, remotePath: string): Promise<void>;
    mkdir(remoteDir: string, recursive?: boolean): Promise<void>;
    end(): Promise<void>;
  }
}
