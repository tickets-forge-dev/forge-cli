// Auth types for CLI Device Flow and token management

export interface DeviceFlowRequest {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceFlowToken {
  accessToken: string;
  refreshToken: string;
  userId: string;
  teamId: string;
  user: {
    email: string;
    displayName: string;
  };
}
