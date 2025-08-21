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
	awseshConfigFileName   = "awsesh"
	awseshAccountsFileName = "awsesh-accounts"
	awseshTokensFileName   = "awsesh-tokens"

	// Error message constants
	errGetHomeDir       = "failed to get home directory: %w"
	errCreateAwsDir     = "failed to create .aws directory: %w"
	errLoadAwseshConfig = "failed to load awsesh config file: %w"
	errSaveAwseshConfig = "failed to save awsesh config file: %w"
)

// SSOProfile represents an AWS SSO configuration
type SSOProfile struct {
	Name            string
	StartURL        string
	SSORegion       string
	DefaultRegion   string
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
	// Use the same directory as AWS config file to keep awsesh configs together
	awsConfigPath, err := GetAWSConfigPath()
	if err != nil {
		return "", err
	}

	awsDir := filepath.Dir(awsConfigPath)
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf(errCreateAwsDir, err)
	}

	return filepath.Join(awsDir, awseshAccountsFileName), nil
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
		section.Key("sso_region").SetValue(profile.SSORegion)
		section.Key("default_region").SetValue(profile.DefaultRegion)
	}

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

// LoadSSOProfilesFromAWSConfig reads SSO profiles from the AWS config file
func LoadSSOProfilesFromAWSConfig() ([]SSOProfile, error) {
	awsConfigPath, err := GetAWSConfigPath()
	if err != nil {
		return nil, fmt.Errorf("failed to get AWS config path: %w", err)
	}

	cfg, err := ini.Load(awsConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []SSOProfile{}, nil
		}
		return nil, fmt.Errorf("failed to load AWS config file: %w", err)
	}

	var profiles []SSOProfile

	for _, section := range cfg.Sections() {
		sectionName := section.Name()

		// Skip default section
		if sectionName == ini.DefaultSection {
			continue
		}

		// Handle both "profile name" and "name" formats
		var profileName string
		if strings.HasPrefix(sectionName, "profile ") {
			profileName = strings.TrimPrefix(sectionName, "profile ")
		} else {
			profileName = sectionName
		}

		// Check if this is an SSO profile by looking for sso_start_url
		startURL := section.Key("sso_start_url").String()
		if startURL == "" {
			continue
		}

		ssoRegion := section.Key("sso_region").String()
		defaultRegion := section.Key("region").String()

		// If no explicit region is set, use sso_region as default
		if defaultRegion == "" {
			defaultRegion = ssoRegion
		}

		profile := SSOProfile{
			Name:          profileName,
			StartURL:      startURL,
			SSORegion:     ssoRegion,
			DefaultRegion: defaultRegion,
		}

		profiles = append(profiles, profile)
	}

	return profiles, nil
}

// LoadProfiles loads SSO profiles from both AWS config and awsesh config
func (m *Manager) LoadProfiles() ([]SSOProfile, error) {
	var allProfiles []SSOProfile
	profileMap := make(map[string]SSOProfile) // Use map to avoid duplicates

	// First, load profiles from AWS config file
	awsProfiles, err := LoadSSOProfilesFromAWSConfig()
	if err != nil {
		// Log warning but continue - AWS config might not exist or be malformed
		fmt.Fprintf(os.Stderr, "Warning: Failed to load SSO profiles from AWS config: %v\n", err)
	} else {
		for _, profile := range awsProfiles {
			profileMap[profile.Name] = profile
		}
	}

	// Then load profiles from awsesh config (these take precedence)
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf(errLoadAwseshConfig, err)
		}
		// awsesh config doesn't exist, that's fine - use only AWS config profiles
	} else {
		for _, section := range cfg.Sections() {
			if section.Name() == ini.DefaultSection || section.Name() == "metadata" {
				continue
			}

			profile := SSOProfile{
				Name:          section.Name(),
				StartURL:      section.Key("start_url").String(),
				SSORegion:     section.Key("sso_region").String(),
				DefaultRegion: section.Key("default_region").String(),
			}

			// Backwards compatibility: If sso_region is empty, try reading the old 'region' key
			// Remove in the future
			if profile.SSORegion == "" {
				oldRegion := section.Key("region").String()
				if oldRegion != "" {
					profile.SSORegion = oldRegion
					// If default_region is also empty, use the old region value for it too
					if profile.DefaultRegion == "" {
						profile.DefaultRegion = oldRegion
					}
				}
			}

			// Only add if it has a start_url (valid profile)
			if profile.StartURL != "" {
				profileMap[profile.Name] = profile
			}
		}
	}

	// Convert map back to slice
	for _, profile := range profileMap {
		allProfiles = append(allProfiles, profile)
	}

	return allProfiles, nil
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
	// Use the same directory as AWS config file to keep awsesh configs together
	awsConfigPath, err := GetAWSConfigPath()
	if err != nil {
		return "", err
	}

	awsDir := filepath.Dir(awsConfigPath)
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf(errCreateAwsDir, err)
	}

	return filepath.Join(awsDir, awseshConfigFileName), nil
}

func getAwseshTokensPath() (string, error) {
	// Use the same directory as AWS config file to keep awsesh configs together
	awsConfigPath, err := GetAWSConfigPath()
	if err != nil {
		return "", err
	}

	awsDir := filepath.Dir(awsConfigPath)
	if err := os.MkdirAll(awsDir, 0700); err != nil {
		return "", fmt.Errorf(errCreateAwsDir, err)
	}

	return filepath.Join(awsDir, awseshTokensFileName), nil
}

// WriteCredentials writes AWS credentials to the credentials file
func WriteCredentials(accessKeyID, secretAccessKey, sessionToken, region string) error {
	return WriteCredentialsWithProfile(accessKeyID, secretAccessKey, sessionToken, region, "default")
}

// WriteCredentialsWithProfile writes AWS credentials to the credentials file with a specific profile name
func WriteCredentialsWithProfile(accessKeyID, secretAccessKey, sessionToken, region, profileName string) error {
	credentialsPath, err := GetAWSCredentialsPath()
	if err != nil {
		return fmt.Errorf("failed to get credentials path: %w", err)
	}

	if err := EnsureAWSDirectoryExists(credentialsPath); err != nil {
		return err
	}

	cfg, err := ini.Load(credentialsPath)
	if err != nil {
		cfg = ini.Empty()
	}

	section, err := cfg.NewSection(profileName)
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

// GenerateProfileName creates a profile name from account and role information
func GenerateProfileName(accountName, roleName string) string {
	if accountName == "" || roleName == "" {
		return "default"
	}
	// Sanitize the name by replacing spaces and special chars with dashes
	profileName := fmt.Sprintf("%s-%s", accountName, roleName)
	profileName = strings.ReplaceAll(profileName, " ", "-")
	profileName = strings.ReplaceAll(profileName, "_", "-")
	// Convert to lowercase for consistency
	return strings.ToLower(profileName)
}

// GetAWSCredentialsPath returns the AWS credentials file path, respecting AWS_SHARED_CREDENTIALS_FILE
// This enables XDG Base Directory compliance and custom AWS file locations
func GetAWSCredentialsPath() (string, error) {
	// Check if AWS_SHARED_CREDENTIALS_FILE is set
	if credentialsFile := os.Getenv("AWS_SHARED_CREDENTIALS_FILE"); credentialsFile != "" {
		return credentialsFile, nil
	}

	// Fall back to default location
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf(errGetHomeDir, err)
	}

	return filepath.Join(homeDir, ".aws", "credentials"), nil
}

// GetAWSConfigPath returns the AWS config file path, respecting AWS_CONFIG_FILE
// This enables XDG Base Directory compliance and custom AWS file locations
func GetAWSConfigPath() (string, error) {
	// Check if AWS_CONFIG_FILE is set
	if configFile := os.Getenv("AWS_CONFIG_FILE"); configFile != "" {
		return configFile, nil
	}

	// Fall back to default location
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf(errGetHomeDir, err)
	}

	return filepath.Join(homeDir, ".aws", "config"), nil
}

// EnsureAWSDirectoryExists ensures the parent directory of the AWS file exists
func EnsureAWSDirectoryExists(filePath string) error {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create AWS directory %s: %w", dir, err)
	}
	return nil
}

// SaveLastSelectedAccount saves the last selected account name for a specific SSO profile
func (m *Manager) SaveLastSelectedAccount(profileName, accountName string) error {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf(errLoadAwseshConfig, err)
		}
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		// If section doesn't exist, create it
		section, err = cfg.NewSection(profileName)
		if err != nil {
			return fmt.Errorf("failed to create section for profile %s: %w", profileName, err)
		}
	}

	section.Key("last_account").SetValue(accountName)

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

// GetLastSelectedAccount retrieves the last selected account name for a specific SSO profile
func (m *Manager) GetLastSelectedAccount(profileName string) (string, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf(errLoadAwseshConfig, err)
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		return "", nil
	}

	return section.Key("last_account").String(), nil
}

// SaveLastSelectedRole saves the last selected role for a specific SSO profile and account
func (m *Manager) SaveLastSelectedRole(profileName, accountName, roleName string) error {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf(errLoadAwseshConfig, err)
		}
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		// If section doesn't exist, create it
		section, err = cfg.NewSection(profileName)
		if err != nil {
			return fmt.Errorf("failed to create section for profile %s: %w", profileName, err)
		}
	}

	// Store the role under a key that includes the account name
	section.Key(fmt.Sprintf("last_role_%s", accountName)).SetValue(roleName)

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

// GetLastSelectedRole retrieves the last selected role for a specific SSO profile and account
func (m *Manager) GetLastSelectedRole(profileName, accountName string) (string, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf(errLoadAwseshConfig, err)
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		return "", nil
	}

	return section.Key(fmt.Sprintf("last_role_%s", accountName)).String(), nil
}

// SaveAccountRegion saves the region for a specific account in an SSO profile
func (m *Manager) SaveAccountRegion(profileName, accountName, region string) error {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf(errLoadAwseshConfig, err)
		}
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		// If section doesn't exist, create it
		section, err = cfg.NewSection(profileName)
		if err != nil {
			return fmt.Errorf("failed to create section for profile %s: %w", profileName, err)
		}
	}

	// Store the region under a key that includes the account name
	section.Key(fmt.Sprintf("region_%s", accountName)).SetValue(region)

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

// GetAccountRegion retrieves the region for a specific account in an SSO profile
func (m *Manager) GetAccountRegion(profileName, accountName string) (string, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf(errLoadAwseshConfig, err)
	}

	section, err := cfg.GetSection(profileName)
	if err != nil {
		return "", nil
	}

	return section.Key(fmt.Sprintf("region_%s", accountName)).String(), nil
}

func (m *Manager) SaveLastSelectedSSOProfile(profileName string) error {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf(errLoadAwseshConfig, err)
		}
	}

	section, err := cfg.GetSection("metadata")
	if err != nil {
		section, err = cfg.NewSection("metadata")
		if err != nil {
			return fmt.Errorf("failed to create metadata section: %w", err)
		}
	}

	section.Key("last_sso_profile").SetValue(profileName)

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

func (m *Manager) GetLastSelectedSSOProfile() (string, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf(errLoadAwseshConfig, err)
	}

	section, err := cfg.GetSection("metadata")
	if err != nil {
		// Section doesn't exist, so no last profile saved
		return "", nil
	}

	return section.Key("last_sso_profile").String(), nil
}

// SaveProfileNameForAccountRole saves the custom profile name used for a specific account+role combination
func (m *Manager) SaveProfileNameForAccountRole(ssoProfileName, accountName, roleName, customProfileName string) error {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			cfg = ini.Empty()
		} else {
			return fmt.Errorf(errLoadAwseshConfig, err)
		}
	}

	section, err := cfg.GetSection(ssoProfileName)
	if err != nil {
		// If section doesn't exist, create it
		section, err = cfg.NewSection(ssoProfileName)
		if err != nil {
			return fmt.Errorf("failed to create section for profile %s: %w", ssoProfileName, err)
		}
	}

	// Store the profile name under a key that includes both account and role name
	section.Key(fmt.Sprintf("profile_name_%s_%s", accountName, roleName)).SetValue(customProfileName)

	if err := cfg.SaveTo(m.configPath); err != nil {
		return fmt.Errorf(errSaveAwseshConfig, err)
	}

	return nil
}

// GetProfileNameForAccountRole retrieves the custom profile name for a specific account+role combination
func (m *Manager) GetProfileNameForAccountRole(ssoProfileName, accountName, roleName string) (string, error) {
	cfg, err := ini.Load(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", fmt.Errorf(errLoadAwseshConfig, err)
	}

	section, err := cfg.GetSection(ssoProfileName)
	if err != nil {
		return "", nil
	}

	return section.Key(fmt.Sprintf("profile_name_%s_%s", accountName, roleName)).String(), nil
}
