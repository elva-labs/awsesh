package aws

import "time"

// Account represents an AWS account accessible via SSO
type Account struct {
	Name         string
	AccountID    string
	Roles        []string
	SelectedRole string
}

// SSOLoginInfo contains information about an active SSO login session
type SSOLoginInfo struct {
	VerificationUri         string
	VerificationUriComplete string
	UserCode                string
	DeviceCode              string
	Interval                int32
	ClientID                string
	ClientSecret            string
	ExpiresAt               time.Time
	StartUrl                string
	RequestID               string
}

// TokenCache represents cached SSO token information
type TokenCache struct {
	AccessToken string    `json:"access_token"`
	ExpiresAt   time.Time `json:"expires_at"`
	StartURL    string    `json:"start_url"`
}
