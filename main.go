package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"slices"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sso"
	"github.com/aws/aws-sdk-go-v2/service/ssooidc"
	"github.com/aws/aws-sdk-go-v2/service/sts"
	"github.com/aws/smithy-go"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Model states
const (
	stateSelectSSO = iota
	stateSelectAccount
	stateSessionSuccess
	stateAddSSO
	stateEditSSO
)

// Styling
var (
	basePink   = lipgloss.Color("#fea7e5")
	baseBlue   = lipgloss.Color("#00f5ff")
	baseYellow = lipgloss.Color("#fcf75f")
	baseGreen  = lipgloss.Color("#a0f077")
	baseRed    = lipgloss.Color("#ff4d4d")

	errorStyle = lipgloss.NewStyle().
			Foreground(baseRed)

	successStyle = lipgloss.NewStyle().
			Foreground(baseGreen)

	highlightStyle = lipgloss.NewStyle().
			Foreground(baseBlue)

	successBox = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(baseYellow).
			Padding(1, 3).
			Margin(1, 0)

	titleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFDF5")).
			Background(lipgloss.Color("#25A065")).
			Padding(0, 1)

	inputStyle = lipgloss.NewStyle().
			BorderStyle(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("240")).
			PaddingLeft(1)
)

// Messages
type fetchAccountsSuccessMsg struct {
	accounts []AWSAccount
}

type fetchAccountsErrMsg struct {
	err error
}

type ssoLoginSuccessMsg struct {
	accessToken string
}

type ssoLoginErrMsg struct {
	err error
}

type credentialsSetMsg struct{}

type ssoVerificationStartedMsg struct {
	verificationUri         string
	verificationUriComplete string
	userCode                string
	deviceCode              string
	interval                int32
	clientId                string
	clientSecret            string
	expiresAt               time.Time
}

type ssoTokenPollingTickMsg struct {
	verification ssoVerificationStartedMsg
}

// Main app model
type model struct {
	state       int
	ssoProfiles []SSOProfile
	selectedSSO *SSOProfile
	accounts    []AWSAccount
	selectedAcc *AWSAccount
	ssoList     list.Model
	accountList list.Model
	spinner     spinner.Model
	width       int
	height      int

	// Form for adding/editing SSO profile
	inputs       []textinput.Model
	formError    string
	formSuccess  string
	focusIndex   int
	editingIndex int // Index of the profile being edited

	// AWS
	cfg           aws.Config
	ssoClient     *sso.Client
	ssooidcClient *ssooidc.Client
	stsClient     *sts.Client
	accessToken   string
	sessionExpiry time.Time
	errorMessage  string
	loadingText   string

	// SSO verification fields
	verificationUri         string
	verificationUriComplete string
	verificationCode        string
}

// SSOProfile represents an AWS SSO configuration
type SSOProfile struct {
	Name            string
	StartURL        string
	Region          string
	AccountsLoading bool
}

// AWSAccount represents an AWS account accessible via SSO
type AWSAccount struct {
	Name         string
	AccountID    string
	Roles        []string
	SelectedRole string
}

// Items to display in list
type item struct {
	title       string
	description string
}

func (i item) Title() string       { return i.title }
func (i item) Description() string { return i.description }
func (i item) FilterValue() string { return i.title }

// Initialize form inputs
func initialInputs() []textinput.Model {
	inputs := make([]textinput.Model, 3)

	var t textinput.Model

	// Alias input
	t = textinput.New()
	t.Placeholder = "My Company SSO"
	t.Focus()
	t.CharLimit = 50
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[0] = t

	// Portal URL input
	t = textinput.New()
	t.Placeholder = "https://company.awsapps.com/start"
	t.CharLimit = 100
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[1] = t

	// Region input
	t = textinput.New()
	t.Placeholder = "us-east-1"
	t.CharLimit = 20
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[2] = t

	return inputs
}

// Load SSO profiles from configuration
func loadSSOProfiles() []SSOProfile {
	// Mock data for SSO profiles (replace with actual config file loading in production)
	return []SSOProfile{
		{Name: "Donedev", StartURL: "https://donedev.awsapps.com/start", Region: "eu-north-1"},
		{Name: "Company Prod", StartURL: "https://company-prod.awsapps.com/start", Region: "us-west-2"},
		{Name: "Personal", StartURL: "https://personal.awsapps.com/start", Region: "eu-west-1"},
	}
}

// Initialize the application
func initialModel() model {
	// Create delegate for styling list items
	delegate := list.NewDefaultDelegate()

	// Create empty SSO list
	ssoList := list.New([]list.Item{}, delegate, 0, 0)
	ssoList.Title = "Select AWS SSO Profile"
	ssoList.AdditionalShortHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("a"),
				key.WithHelp("a", "add new"),
			),
			key.NewBinding(
				key.WithKeys("e"),
				key.WithHelp("e", "edit"),
			),
			key.NewBinding(
				key.WithKeys("d"),
				key.WithHelp("d", "delete"),
			),
		}
	}

	// Empty account list (will be populated later)
	accountList := list.New([]list.Item{}, delegate, 0, 0)
	accountList.Title = "Select AWS Account"

	// Create spinner for loading states
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	// Try to load existing profiles (if available)
	ssoProfiles := loadSSOProfiles()

	// Create initial model
	m := model{
		state:        stateSelectSSO,
		ssoProfiles:  ssoProfiles,
		ssoList:      ssoList,
		accountList:  accountList,
		spinner:      s,
		inputs:       initialInputs(),
		focusIndex:   0,
		editingIndex: -1,
		errorMessage: "",
	}

	// Update the list items
	if len(ssoProfiles) > 0 {
		m.updateSSOList()
	}

	return m
}

// Initialize AWS clients for a specific region
func (m *model) initAWSClients(region string) error {
	var err error
	m.cfg, err = config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
	)
	if err != nil {
		return fmt.Errorf("unable to load SDK config: %w", err)
	}

	m.ssoClient = sso.NewFromConfig(m.cfg)
	m.ssooidcClient = ssooidc.NewFromConfig(m.cfg)
	m.stsClient = sts.NewFromConfig(m.cfg)

	return nil
}

// Start SSO login process
func startSSOLogin(startUrl string, region string) tea.Cmd {
	return func() tea.Msg {
		// Create a temporary context for this operation
		ctx := context.Background()

		// Load AWS SDK configuration
		cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to load AWS config: %w", err)}
		}

		// Create OIDC client for authentication
		oidcClient := ssooidc.NewFromConfig(cfg)

		// Register client
		registerOutput, err := oidcClient.RegisterClient(ctx, &ssooidc.RegisterClientInput{
			ClientName: aws.String("aws-sso-cli-tool"),
			ClientType: aws.String("public"),
		})
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to register OIDC client: %w", err)}
		}

		// Start device authorization
		deviceAuthOutput, err := oidcClient.StartDeviceAuthorization(ctx, &ssooidc.StartDeviceAuthorizationInput{
			ClientId:     registerOutput.ClientId,
			ClientSecret: registerOutput.ClientSecret,
			StartUrl:     aws.String(startUrl),
		})
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to start device authorization: %w", err)}
		}

		// Open browser for the user to login
		_ = openBrowser(*deviceAuthOutput.VerificationUriComplete)
		// Ignore browser open errors - we'll show the URL in the UI

		// Calculate expiration time
		expiresIn := time.Now().Add(time.Duration(deviceAuthOutput.ExpiresIn) * time.Second)

		// Return an interim message to update the UI with verification info
		return ssoVerificationStartedMsg{
			verificationUri:         *deviceAuthOutput.VerificationUri,
			verificationUriComplete: *deviceAuthOutput.VerificationUriComplete,
			userCode:                *deviceAuthOutput.UserCode,
			deviceCode:              *deviceAuthOutput.DeviceCode,
			interval:                deviceAuthOutput.Interval,
			clientId:                *registerOutput.ClientId,
			clientSecret:            *registerOutput.ClientSecret,
			expiresAt:               expiresIn,
		}
	}
}

func pollForSSOToken(msg ssoVerificationStartedMsg) tea.Cmd {
	return func() tea.Msg {
		// Create a temporary context for this operation
		ctx := context.Background()

		// Create OIDC client
		cfg, err := config.LoadDefaultConfig(ctx)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to load AWS config: %w", err)}
		}
		oidcClient := ssooidc.NewFromConfig(cfg)

		tokenInput := &ssooidc.CreateTokenInput{
			ClientId:     &msg.clientId,
			ClientSecret: &msg.clientSecret,
			DeviceCode:   &msg.deviceCode,
			GrantType:    aws.String("urn:ietf:params:oauth:grant-type:device_code"),
		}

		// Poll once for token
		tokenOutput, err := oidcClient.CreateToken(ctx, tokenInput)
		if err != nil {
			// Check for specific error types
			var apiErr smithy.APIError
			if errors.As(err, &apiErr) {
				// Handle API errors
				switch apiErr.ErrorCode() {
				case "AuthorizationPendingException":
					// This is expected while waiting for user to complete login
					if time.Now().After(msg.expiresAt) {
						return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out")}
					}
					// Return a cmd to poll again after the interval
					return tea.Tick(time.Duration(msg.interval)*time.Second, func(time.Time) tea.Msg {
						return ssoTokenPollingTickMsg{verification: msg}
					})
				case "SlowDownException":
					// We're polling too quickly
					// Poll again with longer interval
					return tea.Tick(time.Duration(msg.interval*2)*time.Second, func(time.Time) tea.Msg {
						return ssoTokenPollingTickMsg{verification: msg}
					})
				case "ExpiredTokenException":
					return ssoLoginErrMsg{err: fmt.Errorf("device code expired")}
				default:
					return ssoLoginErrMsg{err: fmt.Errorf("API error during token creation: %s: %s",
						apiErr.ErrorCode(), apiErr.ErrorMessage())}
				}
			}

			// For unrecognized errors, wait and try again
			if time.Now().After(msg.expiresAt) {
				return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out")}
			}
			return tea.Tick(time.Duration(msg.interval)*time.Second, func(time.Time) tea.Msg {
				return ssoTokenPollingTickMsg{verification: msg}
			})
		}

		// Successfully got token
		return ssoLoginSuccessMsg{accessToken: *tokenOutput.AccessToken}
	}
}

// Fetch AWS accounts available to the user
func fetchAccounts(client *sso.Client, accessToken string) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		// List accounts
		var accounts []AWSAccount
		var nextToken *string

		for {
			resp, err := client.ListAccounts(ctx, &sso.ListAccountsInput{
				AccessToken: aws.String(accessToken),
				NextToken:   nextToken,
			})
			if err != nil {
				return fetchAccountsErrMsg{err: fmt.Errorf("failed to list accounts: %w", err)}
			}

			// Process accounts
			for _, acc := range resp.AccountList {
				// For each account, get available roles
				roles, err := listAccountRoles(ctx, client, accessToken, *acc.AccountId)
				if err != nil {
					return fetchAccountsErrMsg{err: fmt.Errorf("failed to list roles for account %s: %w", *acc.AccountId, err)}
				}

				accounts = append(accounts, AWSAccount{
					Name:      *acc.AccountName,
					AccountID: *acc.AccountId,
					Roles:     roles,
				})
			}

			nextToken = resp.NextToken
			if nextToken == nil {
				break
			}
		}

		return fetchAccountsSuccessMsg{accounts: accounts}
	}
}

// List roles available for a specific account
func listAccountRoles(ctx context.Context, client *sso.Client, accessToken string, accountID string) ([]string, error) {
	var roles []string
	var nextToken *string

	for {
		resp, err := client.ListAccountRoles(ctx, &sso.ListAccountRolesInput{
			AccessToken: aws.String(accessToken),
			AccountId:   aws.String(accountID),
			NextToken:   nextToken,
		})
		if err != nil {
			return nil, err
		}

		for _, role := range resp.RoleList {
			roles = append(roles, *role.RoleName)
		}

		nextToken = resp.NextToken
		if nextToken == nil {
			break
		}
	}

	return roles, nil
}

// Get credentials for a specific role
func getRoleCredentials(client *sso.Client, accessToken, accountID, roleName string) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		resp, err := client.GetRoleCredentials(ctx, &sso.GetRoleCredentialsInput{
			AccessToken: aws.String(accessToken),
			AccountId:   aws.String(accountID),
			RoleName:    aws.String(roleName),
		})
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to get role credentials: %w", err)}
		}

		// Set AWS environment variables
		os.Setenv("AWS_ACCESS_KEY_ID", *resp.RoleCredentials.AccessKeyId)
		os.Setenv("AWS_SECRET_ACCESS_KEY", *resp.RoleCredentials.SecretAccessKey)
		os.Setenv("AWS_SESSION_TOKEN", *resp.RoleCredentials.SessionToken)
		os.Setenv("AWS_DEFAULT_REGION", client.Options().Region)

		return credentialsSetMsg{}
	}
}

// Helper function to open browser for SSO login
func openBrowser(url string) error {
	var cmd *exec.Cmd
	var err error

	switch runtime.GOOS {
	case "linux":
		for _, cmd := range []string{"xdg-open", "sensible-browser", "x-www-browser", "gnome-open", "kde-open"} {
			if _, err = exec.LookPath(cmd); err == nil {
				return exec.Command(cmd, url).Start()
			}
		}
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("unsupported platform")
	}

	return cmd.Start()
}

func (m model) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		m.ssoList.SetWidth(msg.Width)
		m.ssoList.SetHeight(msg.Height - 4)

		m.accountList.SetWidth(msg.Width)
		m.accountList.SetHeight(msg.Height - 4)

	case tea.KeyMsg:
		// Global keybindings
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q":
			if m.state != stateAddSSO && m.state != stateEditSSO {
				return m, tea.Quit
			}
		case "esc":
			switch m.state {
			case stateSelectAccount:
				m.state = stateSelectSSO
				m.errorMessage = ""
				return m, nil
			case stateSessionSuccess:
				m.state = stateSelectAccount
				return m, nil
			case stateAddSSO, stateEditSSO:
				// Reset form
				m.inputs = initialInputs()
				m.focusIndex = 0
				m.formError = ""
				m.formSuccess = ""
				m.editingIndex = -1
				m.state = stateSelectSSO
				return m, nil
			}
		}

		// State-specific logic
		switch m.state {
		case stateSelectSSO:
			switch msg.String() {
			case "a":
				// Switch to add SSO form - works even with no profiles
				if m.ssoList.FilterState() == 0 {
					m.state = stateAddSSO
					m.formError = ""
					m.formSuccess = ""
					m.inputs = initialInputs()
					m.focusIndex = 0
					return m, nil
				}

			case "e":
				// Edit selected SSO only if profiles exist
				if len(m.ssoProfiles) > 0 && m.ssoList.FilterState() == 0 {
					if i, ok := m.ssoList.SelectedItem().(item); ok {
						for idx, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								// Initialize form with existing values
								m.editingIndex = idx
								m.state = stateEditSSO
								m.formError = ""
								m.formSuccess = ""
								m.inputs = initialInputs()

								// Set values from selected profile
								m.inputs[0].SetValue(profile.Name)
								m.inputs[1].SetValue(profile.StartURL)
								m.inputs[2].SetValue(profile.Region)

								m.focusIndex = 0
								return m, nil
							}
						}
					}
				}

			case "d":
				// Delete selected SSO only if profiles exist
				if len(m.ssoProfiles) > 0 && m.ssoList.FilterState() == 0 {
					if i, ok := m.ssoList.SelectedItem().(item); ok {
						for idx, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								// Remove the profile
								m.ssoProfiles = slices.Delete(m.ssoProfiles, idx, idx+1)

								// Update the list
								m.updateSSOList()
								return m, nil
							}
						}
					}
				}

			case "enter":
				// Only proceed if profiles exist
				if len(m.ssoProfiles) > 0 {
					i, ok := m.ssoList.SelectedItem().(item)
					if ok {
						for _, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								m.selectedSSO = &profile

								// Initialize AWS clients for the selected region
								err := m.initAWSClients(profile.Region)
								if err != nil {
									m.errorMessage = fmt.Sprintf("Failed to initialize AWS clients: %v", err)
									return m, nil
								}

								// Start SSO login flow
								m.state = stateSelectAccount
								m.loadingText = "Starting SSO login process..."
								return m, startSSOLogin(profile.StartURL, profile.Region)
							}
						}
					}
				}
			}

		case stateSelectAccount:
			if msg.String() == "enter" {
				i, ok := m.accountList.SelectedItem().(item)
				if ok {
					for idx, acc := range m.accounts {
						if acc.Name == i.Title() {
							// For simplicity, we'll just select the first role
							if len(m.accounts[idx].Roles) > 0 {
								m.accounts[idx].SelectedRole = m.accounts[idx].Roles[0]
								m.selectedAcc = &m.accounts[idx]

								// Get credentials for the selected role
								return m, getRoleCredentials(
									m.ssoClient,
									m.accessToken,
									m.selectedAcc.AccountID,
									m.selectedAcc.SelectedRole,
								)
							}
						}
					}
				}
			}

		case stateAddSSO, stateEditSSO:
			switch msg.String() {
			case "tab", "shift+tab", "enter", "up", "down":
				// Handle input navigation
				if msg.String() == "enter" && m.focusIndex == len(m.inputs) {
					// Submit form
					if m.state == stateAddSSO {
						return m.handleAddFormSubmission()
					} else {
						return m.handleEditFormSubmission()
					}
				}

				// Cycle through inputs
				if msg.String() == "up" || msg.String() == "shift+tab" {
					m.focusIndex--
				} else {
					m.focusIndex++
				}

				if m.focusIndex > len(m.inputs) {
					m.focusIndex = 0
				} else if m.focusIndex < 0 {
					m.focusIndex = len(m.inputs)
				}

				// Update focus states
				for i := range m.inputs {
					if i == m.focusIndex {
						// Set focused state
						cmds = append(cmds, m.inputs[i].Focus())
					} else {
						// Remove focused state
						m.inputs[i].Blur()
					}
				}

				return m, tea.Batch(cmds...)
			}
		}

	case ssoLoginSuccessMsg:
		m.accessToken = msg.accessToken
		m.loadingText = "SSO login successful! Fetching accounts..."
		m.errorMessage = ""
		return m, fetchAccounts(m.ssoClient, m.accessToken)

	case ssoLoginErrMsg:
		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case fetchAccountsSuccessMsg:
		m.accounts = msg.accounts
		m.state = stateSelectAccount
		m.errorMessage = ""

		// Create account list items
		accountItems := make([]list.Item, len(m.accounts))
		for i, acc := range m.accounts {
			accountItems[i] = item{
				title:       acc.Name,
				description: fmt.Sprintf("Account ID: %s, Roles: %s", acc.AccountID, strings.Join(acc.Roles, ", ")),
			}
		}

		// Update account list title with breadcrumb
		m.accountList.Title = fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
		m.accountList.SetItems(accountItems)
		return m, nil

	case fetchAccountsErrMsg:
		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case credentialsSetMsg:
		m.state = stateSessionSuccess
		return m, nil

	case ssoVerificationStartedMsg:
		// Update model with verification information
		m.loadingText = "Waiting for browser authentication..."
		m.verificationUri = msg.verificationUri
		m.verificationUriComplete = msg.verificationUriComplete
		m.verificationCode = msg.userCode

		// Start polling for token and keep spinner going
		return m, tea.Batch(
			pollForSSOToken(msg),
			m.spinner.Tick,
		)

	case ssoTokenPollingTickMsg:
		// Continue polling and keep spinner going
		return m, tea.Batch(
			pollForSSOToken(msg.verification),
			m.spinner.Tick,
		)

	case spinner.TickMsg:
		// Handle spinner ticks
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}

	// Handle updates for the individual components based on state
	switch m.state {
	case stateSelectSSO:
		var cmd tea.Cmd
		m.ssoList, cmd = m.ssoList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSelectAccount:
		var cmd tea.Cmd
		m.accountList, cmd = m.accountList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSessionSuccess:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case stateAddSSO, stateEditSSO:
		// Handle text input updates
		for i := range m.inputs {
			if i == m.focusIndex {
				var cmd tea.Cmd
				m.inputs[i], cmd = m.inputs[i].Update(msg)
				cmds = append(cmds, cmd)
			}
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *model) handleAddFormSubmission() (tea.Model, tea.Cmd) {
	// Get values from inputs
	alias := strings.TrimSpace(m.inputs[0].Value())
	portalURL := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	// Validate inputs
	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if portalURL == "" {
		m.formError = "Portal URL cannot be empty"
		return m, nil
	}

	if !strings.HasPrefix(portalURL, "https://") || !strings.Contains(portalURL, ".awsapps.com/start") {
		m.formError = "Portal URL should be in format: https://company.awsapps.com/start"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	// Check for duplicate alias
	for _, profile := range m.ssoProfiles {
		if profile.Name == alias {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	// Create new SSO profile
	newProfile := SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	// Add to profiles
	m.ssoProfiles = append(m.ssoProfiles, newProfile)

	// Update SSO list
	m.updateSSOList()

	// Show success message
	m.formSuccess = "SSO profile added successfully!"
	m.formError = ""

	// Reset form
	m.inputs = initialInputs()
	m.focusIndex = 0

	return m, nil
}

func (m *model) handleEditFormSubmission() (tea.Model, tea.Cmd) {
	// Get values from inputs
	alias := strings.TrimSpace(m.inputs[0].Value())
	portalURL := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	// Validate inputs
	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if portalURL == "" {
		m.formError = "Portal URL cannot be empty"
		return m, nil
	}

	if !strings.HasPrefix(portalURL, "https://") || !strings.Contains(portalURL, ".awsapps.com/start") {
		m.formError = "Portal URL should be in format: https://company.awsapps.com/start"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	// Check for duplicate alias
	for idx, profile := range m.ssoProfiles {
		if profile.Name == alias && idx != m.editingIndex {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	// Update the profile
	m.ssoProfiles[m.editingIndex] = SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	// Update SSO list
	m.updateSSOList()

	// Show success message
	m.formSuccess = "SSO profile updated successfully!"
	m.formError = ""

	return m, nil
}

func (m *model) updateSSOList() {
	// Update SSO list items
	ssoItems := make([]list.Item, len(m.ssoProfiles))
	for i, profile := range m.ssoProfiles {
		ssoItems[i] = item{
			title:       profile.Name,
			description: fmt.Sprintf("Region: %s", profile.Region),
		}
	}
	m.ssoList.SetItems(ssoItems)
}

func (m model) View() string {
	var s string

	// If there's an error message, show it at the bottom
	errorBar := ""
	if m.errorMessage != "" {
		errorBar = "\n" + errorStyle.Render(m.errorMessage)
	}

	switch m.state {
	case stateSelectSSO:
		s = m.ssoList.View()

	case stateSelectAccount:
		// Show loading spinner while fetching accounts
		if len(m.accounts) == 0 {
			var verificationInfo string
			if m.verificationUri != "" && m.verificationCode != "" {
				verificationInfo = fmt.Sprintf(
					"\n\nTo login, visit: %s\nOr go to: %s and enter code: %s",
					highlightStyle.Render(m.verificationUriComplete),
					m.verificationUri,
					highlightStyle.Render(m.verificationCode),
				)
			}

			s = lipgloss.JoinVertical(lipgloss.Center,
				m.spinner.View()+" "+m.loadingText,
				"Your browser should open for SSO login. Please complete the login process.",
				verificationInfo,
			)
		} else {
			s = m.accountList.View()
		}

	case stateSessionSuccess:
		// Create more consistent session success view
		sessionContent := successBox.Render(
			fmt.Sprintf("%s Session activated!\n\n"+
				"Account: %s (%s)\n"+
				"Role: %s\n\n"+
				"AWS environment variables have been set.",
				m.spinner.View(),
				m.selectedAcc.Name,
				m.selectedAcc.AccountID,
				m.selectedAcc.SelectedRole))

		helpText := lipgloss.NewStyle().
			Foreground(lipgloss.Color("240")).
			Render("Press ESC to go back or q to quit")

		s = lipgloss.JoinVertical(lipgloss.Left,
			sessionContent,
			helpText,
		)

	case stateAddSSO, stateEditSSO:
		// Form view
		var formTitle string
		if m.state == stateAddSSO {
			formTitle = titleStyle.Render("Add New AWS SSO Profile")
		} else {
			formTitle = titleStyle.Render("Edit AWS SSO Profile")
		}

		// Form fields
		fields := []string{
			"Alias (friendly name):",
			"Portal URL:",
			"Default Region:",
		}

		var formContent strings.Builder

		// Add spacing
		formContent.WriteString("\n\n")

		// Render each form field
		for i, field := range fields {
			input := m.inputs[i].View()
			if i == m.focusIndex {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", highlightStyle.Render(field), input))
			} else {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(field), input))
			}
		}

		// Submit button
		button := "[ Submit ]"
		if m.focusIndex == len(m.inputs) {
			button = highlightStyle.Render("[ Submit ]")
		}
		formContent.WriteString("\n" + button + "\n\n")

		// Error or success message
		if m.formError != "" {
			formContent.WriteString("\n" + errorStyle.Render(m.formError) + "\n")
		}

		if m.formSuccess != "" {
			formContent.WriteString("\n" + successStyle.Render(m.formSuccess) + "\n")
		}

		// Help text
		formContent.WriteString("\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render("Press ESC to cancel") + "\n")

		// Combine all parts
		s = lipgloss.JoinVertical(lipgloss.Left, formTitle, formContent.String())
	}

	return s + errorBar
}

func main() {
	os.Setenv("AWS_SDK_GO_V2_ENABLETRUSTEDCREDENTIALSFEATURE", "true")

	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running program: %v", err)
		os.Exit(1)
	}
}
