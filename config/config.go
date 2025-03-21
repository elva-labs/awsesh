package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	awsclient "awsesh/aws"

	"gopkg.in/ini.v1"
)

const (
	awseshConfigFileName = "awsesh"
	awseshTokensFileName = "awsesh-tokens"
)

// SSOProfile represents an AWS SSO configuration
type SSOProfile struct {
	Name            string
	StartURL        string
	Region          string
	AccountsLoading bool
}

// Manager handles configuration file operations
type Manager struct {
	configPath string
	tokensPath string
}

// NewManager creates a new configuration manager
func NewManager() (*Manager, error) {
	configPath, err := getAwseshConfigPath()
	if err != nil {
		return nil, err
	}

	tokensPath, err := getAwseshTokensPath()
	if err != nil {
		return nil, err
	}

	return &Manager{
		configPath: configPath,
		tokensPath: tokensPath,
	}, nil
}

// SaveProfiles saves SSO profiles to configuration file
func (m *Manager) SaveProfiles(profiles []SSOProfile) error {
	cfg := ini.Empty()

	for _, profile := range profiles {
		section, err := cfg.NewSection(profile.Name)
		if err != nil {
			return fmt.Errorf("failed to create section for profile %s: %w", profile.Name, err)
		}

		section.Key("start_url").SetValue(profile.StartURL)
		section.Key("region").SetValue(profile.Region)
	}

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf("failed to save awsesh config file: %w", err)
	}

	return nil
}

// LoadProfiles loads SSO profiles from configuration
func (m *Manager) LoadProfiles() ([]SSOProfile, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []SSOProfile{}, nil
		}
		return nil, fmt.Errorf("failed to load awsesh config file: %w", err)
	}

	var profiles []SSOProfile

	for _, section := range cfg.Sections() {
		if section.Name() == ini.DefaultSection {
			continue
		}

		profile := SSOProfile{
			Name:     section.Name(),
			StartURL: section.Key("start_url").String(),
			Region:   section.Key("region").String(),
		}

		profiles = append(profiles, profile)
	}

	return profiles, nil
}

// SaveToken saves an SSO token to cache
func (m *Manager) SaveToken(startURL string, token string, expiresAt time.Time) error {
	cfg, err := ini.Load(m.tokensPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf("failed to load tokens file: %w", err)
		}
	}

	section, err := cfg.NewSection(startURL)
	if err != nil {
		return fmt.Errorf("failed to create section for token: %w", err)
	}

	section.Key("access_token").SetValue(token)
	section.Key("expires_at").SetValue(expiresAt.Format(time.RFC3339))

	if err := cfg.SaveTo(m.tokensPath); err != nil {
		return fmt.Errorf("failed to save tokens file: %w", err)
	}

	return nil
}

// LoadToken loads a token from cache
func (m *Manager) LoadToken(startURL string) (*awsclient.TokenCache, error) {
	cfg, err := ini.Load(m.tokensPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to load tokens file: %w", err)
	}

	section, err := cfg.GetSection(startURL)
	if err != nil {
		return nil, nil
	}

	token := section.Key("access_token").String()
	expiresAtStr := section.Key("expires_at").String()
	if token == "" || expiresAtStr == "" {
		return nil, nil
	}

	expiresAt, err := time.Parse(time.RFC3339, expiresAtStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse token expiration: %w", err)
	}

	if time.Now().After(expiresAt) {
		return nil, nil
	}

	return &awsclient.TokenCache{
		AccessToken: token,
		ExpiresAt:   expiresAt,
		StartURL:    startURL,
	}, nil
}

func getAwseshConfigPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	awsDir := filepath.Join(homeDir, ".aws")
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf("failed to create .aws directory: %w", err)
	}

	return filepath.Join(awsDir, awseshConfigFileName), nil
}

func getAwseshTokensPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	awsDir := filepath.Join(homeDir, ".aws")
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf("failed to create .aws directory: %w", err)
	}

	return filepath.Join(awsDir, awseshTokensFileName), nil
}

// WriteCredentials writes AWS credentials to the credentials file
func WriteCredentials(accessKeyID, secretAccessKey, sessionToken, region string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	awsDir := filepath.Join(homeDir, ".aws")
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return fmt.Errorf("failed to create .aws directory: %w", err)
	}

	credentialsPath := filepath.Join(awsDir, "credentials")

	cfg, err := ini.Load(credentialsPath)
	if err != nil {
		cfg = ini.Empty()
	}

	section, err := cfg.NewSection("default")
	if err != nil {
		return fmt.Errorf("failed to create profile section: %w", err)
	}

	section.Key("aws_access_key_id").SetValue(accessKeyID)
	section.Key("aws_secret_access_key").SetValue(secretAccessKey)
	if sessionToken != "" {
		section.Key("aws_session_token").SetValue(sessionToken)
	}
	section.Key("region").SetValue(region)

	if err := cfg.SaveTo(credentialsPath); err != nil {
		return fmt.Errorf("failed to save credentials file: %w", err)
	}

	return nil
}
