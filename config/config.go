package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
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

// CachedAccounts represents the cached accounts for an SSO profile
type CachedAccounts struct {
	ProfileName string
	StartURL    string
	Accounts    []awsclient.Account
	LastUpdated time.Time
}

// SaveCachedAccounts saves accounts to the cache file
func (m *Manager) SaveCachedAccounts(profileName, startURL string, accounts []awsclient.Account) error {
	cachePath, err := getAwseshAccountsCachePath()
	if err != nil {
		return err
	}

	// Load existing cache file
	var allCaches []CachedAccounts
	data, err := os.ReadFile(cachePath)
	if err == nil {
		if err = json.Unmarshal(data, &allCaches); err != nil {
			// If there's an error parsing, just start with a new cache
			allCaches = []CachedAccounts{}
		}
	}

	// Sort accounts by name for consistent ordering
	slices.SortFunc(accounts, func(a, b awsclient.Account) int {
		return strings.Compare(a.Name, b.Name)
	})

	// Find and update existing cache or add new one
	found := false
	for i, cache := range allCaches {
		if cache.StartURL == startURL {
			allCaches[i].Accounts = accounts
			allCaches[i].LastUpdated = time.Now()
			found = true
			break
		}
	}

	if !found {
		allCaches = append(allCaches, CachedAccounts{
			ProfileName: profileName,
			StartURL:    startURL,
			Accounts:    accounts,
			LastUpdated: time.Now(),
		})
	}

	// Save the updated cache
	jsonData, err := json.Marshal(allCaches)
	if err != nil {
		return fmt.Errorf("failed to marshal accounts cache: %w", err)
	}

	if err := os.WriteFile(cachePath, jsonData, 0600); err != nil {
		return fmt.Errorf("failed to write accounts cache: %w", err)
	}

	return nil
}

// LoadCachedAccounts loads cached accounts for a specific SSO profile
func (m *Manager) LoadCachedAccounts(startURL string) ([]awsclient.Account, time.Time, error) {
	cachePath, err := getAwseshAccountsCachePath()
	if err != nil {
		return nil, time.Time{}, err
	}

	data, err := os.ReadFile(cachePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, time.Time{}, nil
		}
		return nil, time.Time{}, fmt.Errorf("failed to read accounts cache: %w", err)
	}

	var allCaches []CachedAccounts
	if err = json.Unmarshal(data, &allCaches); err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to parse accounts cache: %w", err)
	}

	for _, cache := range allCaches {
		if cache.StartURL == startURL {
			return cache.Accounts, cache.LastUpdated, nil
		}
	}

	return nil, time.Time{}, nil
}

// Helper function to get the accounts cache file path
func getAwseshAccountsCachePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}

	awsDir := filepath.Join(homeDir, ".aws")
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf("failed to create .aws directory: %w", err)
	}

	return filepath.Join(awsDir, "awsesh-accounts"), nil
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
