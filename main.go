package main

import (
	"context"
	"errors"
	"fmt"
	"image/color"
	"os"
	"slices"
	"strings"
	"time"

	flag "github.com/spf13/pflag"

	"github.com/aws/smithy-go"
	"github.com/charmbracelet/bubbles/v2/key"
	"github.com/charmbracelet/bubbles/v2/list"
	"github.com/charmbracelet/bubbles/v2/spinner"
	"github.com/charmbracelet/bubbles/v2/textinput"
	tea "github.com/charmbracelet/bubbletea/v2"
	"github.com/charmbracelet/lipgloss/v2"

	"awsesh/aws"
	"awsesh/config"
	"awsesh/utils"
)

// Model states
const (
	stateSelectSSO = iota
	stateSelectAccount
	stateSelectRole
	stateSessionSuccess
	stateAddSSO
	stateEditSSO
	stateDeleteConfirm
	stateSetAccountRegion
)

// Constants for limits
const (
	maxAccountsForRoleLoading = 100
	Version                   = "0.1.2"
)

// Messages
type fetchAccountsSuccessMsg struct {
	accounts  []aws.Account
	requestID string
}

type fetchAccountsErrMsg struct {
	err       error
	requestID string
}

type ssoLoginSuccessMsg struct {
	accessToken string
	requestID   string
}

type ssoLoginErrMsg struct {
	err       error
	requestID string
}

type credentialsSetMsg struct{}

type ssoTokenPollingTickMsg struct {
	info *aws.SSOLoginInfo
}

// Add new message type for browser open error
type browserOpenErrMsg struct {
	err error
}

// Add new message type for browser open success
type browserOpenSuccessMsg struct{}

type loadRolesErrMsg struct {
	accountID string
	err       error
}

// Add new message type for sequential role loading
type loadNextRoleMsg struct {
	accounts    []aws.Account
	currentIdx  int
	accessToken string
}

// Add new message type for role updates
type updateRolesMsg struct {
	accountID  string
	roles      []string
	currentIdx int
}

// Initialize the sequential loading
func startLoadingRoles(accessToken string, accounts []aws.Account) tea.Cmd {
	// If we have more accounts than the limit, don't start loading roles
	if len(accounts) > maxAccountsForRoleLoading {
		return nil
	}

	return func() tea.Msg {
		return loadNextRoleMsg{
			accounts:    accounts,
			currentIdx:  0,
			accessToken: accessToken,
		}
	}
}

// Main app model
type model struct {
	state       int
	ssoProfiles []config.SSOProfile
	selectedSSO *config.SSOProfile
	accounts    []aws.Account
	selectedAcc *aws.Account
	ssoList     list.Model
	accountList list.Model
	roleList    list.Model
	spinner     spinner.Model
	width       int
	height      int

	// Form for adding/editing SSO profile
	inputs       []textinput.Model
	formError    string
	formSuccess  string
	focusIndex   int
	editingIndex int

	// AWS
	awsClient    *aws.Client
	configMgr    *config.Manager
	accessToken  string
	errorMessage string
	loadingText  string

	// SSO verification fields
	verificationUri         string
	verificationUriComplete string
	verificationCode        string

	// Caching
	usingCachedAccounts bool
	accountsLastUpdated time.Time
	currentRequestID    string

	// Delete confirmation
	deleteProfileName string

	// Account region setting
	accountRegionInput textinput.Model

	// Add new field to track if we're authenticating
	isAuthenticating bool

	// Field for dynamic styles
	dynamicStyles dynamicStyles
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
func initialInputs(styles dynamicStyles) []textinput.Model {
	inputs := make([]textinput.Model, 4)
	var t textinput.Model

	// Alias
	t = textinput.New()
	t.Placeholder = "My Company SSO"
	t.Focus()
	t.CharLimit = 50
	t.SetWidth(40)
	t.Prompt = "› "
	inputs[0] = t

	// Company Name
	t = textinput.New()
	t.Placeholder = "company"
	t.CharLimit = 100
	t.SetWidth(40)
	t.Prompt = "› "
	inputs[1] = t

	// SSO Region
	t = textinput.New()
	t.Placeholder = "us-east-1"
	t.CharLimit = 20
	t.SetWidth(40)
	t.Prompt = "› "
	inputs[2] = t

	// Default Region
	t = textinput.New()
	t.Placeholder = "us-east-1"
	t.CharLimit = 20
	t.SetWidth(40)
	t.Prompt = "› "
	inputs[3] = t

	// Apply styles to all inputs
	for i := range inputs {
		inputs[i].Styles.Focused.Text = styles.inputFocusedText
		inputs[i].Styles.Focused.Prompt = styles.inputFocusedPrompt
		inputs[i].Styles.Focused.Placeholder = styles.inputFocusedPlaceholder
		inputs[i].Styles.Blurred.Text = styles.inputBlurredText
	}

	return inputs
}

// Initialize the application
func initialModel() model {
	// Initialize dynamic styles first (assuming dark background)
	initialStyles := getDynamicStyles(true)

	delegate := list.NewDefaultDelegate()
	delegate.UpdateFunc = func(msg tea.Msg, m *list.Model) tea.Cmd {
		return nil
	}

	// Create empty SSO list
	ssoList := list.New([]list.Item{}, delegate, 0, 0)
	ssoList.Title = "Select AWS SSO Profile"
	ssoList.Styles.PaginationStyle = initialStyles.pagination
	ssoList.Styles.HelpStyle = initialStyles.help
	ssoList.SetShowHelp(true)
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
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open dashboard"),
			),
		}
	}
	ssoList.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("a"),
				key.WithHelp("a", "add new SSO profile"),
			),
			key.NewBinding(
				key.WithKeys("e"),
				key.WithHelp("e", "edit selected SSO profile"),
			),
			key.NewBinding(
				key.WithKeys("d"),
				key.WithHelp("d", "delete selected SSO profile"),
			),
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open SSO dashboard"),
			),
		}
	}

	// Empty account list (will be populated later)
	accountList := list.New([]list.Item{}, delegate, 0, 0)
	accountList.Title = "Select AWS Account"
	accountList.Styles.PaginationStyle = initialStyles.pagination
	accountList.Styles.HelpStyle = initialStyles.help
	accountList.AdditionalShortHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("r"),
				key.WithHelp("r", "set region"),
			),
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open in browser"),
			),
		}
	}
	accountList.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("r"),
				key.WithHelp("r", "set region for selected account"),
			),
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open account in AWS Console"),
			),
		}
	}

	// Empty role list (will be populated later)
	roleList := list.New([]list.Item{}, delegate, 0, 0)
	roleList.Title = "Select AWS Role"
	roleList.Styles.PaginationStyle = initialStyles.pagination
	roleList.Styles.HelpStyle = initialStyles.help
	roleList.AdditionalShortHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("enter"),
				key.WithHelp("enter", "select role"),
			),
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open browser"),
			),
			key.NewBinding(
				key.WithKeys("esc"),
				key.WithHelp("esc", "back"),
			),
		}
	}
	roleList.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("enter"),
				key.WithHelp("enter", "select role and set session"),
			),
			key.NewBinding(
				key.WithKeys("o"),
				key.WithHelp("o", "open role in AWS Console"),
			),
			key.NewBinding(
				key.WithKeys("esc"),
				key.WithHelp("esc", "go back to account selection"),
			),
		}
	}

	// Create spinner for loading states
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = initialStyles.spinner

	// Create config manager
	configMgr, err := config.NewManager()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize config manager: %v\n", err)
		os.Exit(1)
	}

	// Try to load existing profiles
	profiles, err := configMgr.LoadProfiles()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to load SSO profiles: %v\n", err)
		profiles = []config.SSOProfile{}
	}

	// Initialize account region input
	regionInput := textinput.New()
	regionInput.Placeholder = "us-east-1"
	regionInput.CharLimit = 20
	regionInput.SetWidth(30)
	regionInput.Prompt = "› "
	regionInput.Styles.Focused.Text = initialStyles.inputFocusedText
	regionInput.Styles.Focused.Prompt = initialStyles.inputFocusedPrompt
	regionInput.Styles.Focused.Placeholder = initialStyles.inputFocusedPlaceholder
	regionInput.Styles.Blurred.Text = initialStyles.inputBlurredText

	// Create initial model
	m := model{
		state:               stateSelectSSO,
		ssoProfiles:         profiles,
		ssoList:             ssoList,
		accountList:         accountList,
		roleList:            roleList,
		spinner:             s,
		inputs:              initialInputs(initialStyles),
		focusIndex:          0,
		editingIndex:        -1,
		errorMessage:        "",
		configMgr:           configMgr,
		usingCachedAccounts: false,
		accountsLastUpdated: time.Time{},
		currentRequestID:    "",
		accountRegionInput:  regionInput,
		isAuthenticating:    false,
		dynamicStyles:       initialStyles,
	}

	// Apply initial dynamic styles to list titles
	m.ssoList.Styles.Title = m.dynamicStyles.title
	m.accountList.Styles.Title = m.dynamicStyles.title
	m.roleList.Styles.Title = m.dynamicStyles.title

	// Update the list items
	if len(profiles) > 0 {
		m.updateSSOList()

		lastProfileName, err := m.configMgr.GetLastSelectedSSOProfile()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to get last used SSO profile: %v\n", err)
		} else if lastProfileName != "" {
			for i, listItem := range m.ssoList.Items() {
				if listItem.(item).Title() == lastProfileName {
					m.ssoList.Select(i)
					break
				}
			}
		}
	} else {
		// If no profiles exist, start in the add state
		m.state = stateAddSSO
	}

	return m
}

// Start SSO login process
func startSSOLogin(startUrl string, configMgr *config.Manager, client *aws.Client, requestID string) tea.Cmd {
	return func() tea.Msg {
		// First check if we have a valid cached token
		cachedToken, err := configMgr.LoadToken(startUrl)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to check token cache: %w", err), requestID: requestID}
		}

		// If we have a valid token, immediately return success
		if cachedToken != nil {
			return ssoLoginSuccessMsg{accessToken: cachedToken.AccessToken, requestID: requestID}
		}

		// Start new SSO login process
		ctx := context.Background()
		loginInfo, err := client.StartSSOLogin(ctx, startUrl)
		if err != nil {
			return ssoLoginErrMsg{err: err, requestID: requestID}
		}

		// Store the requestID in loginInfo for passing through the chain
		loginInfo.RequestID = requestID

		// Open browser for login
		if err := utils.OpenBrowser(loginInfo.VerificationUriComplete); err != nil {
			// Just log the error but continue with the flow
			fmt.Fprintf(os.Stderr, "Warning: Failed to open browser: %v\n", err)
		}

		return loginInfo
	}
}

// Helper function to sort list items by title
func sortItems(items []list.Item) {
	slices.SortFunc(items, func(a, b list.Item) int {
		itemA, _ := a.(item)
		itemB, _ := b.(item)
		return strings.Compare(itemA.title, itemB.title)
	})
}

// Helper function to create account list items
func makeAccountItems(accounts []aws.Account, ssoDefaultRegion string, configMgr *config.Manager, ssoProfileName string) []list.Item {
	accountItems := make([]list.Item, len(accounts))
	for i, acc := range accounts {
		region := acc.Region
		if region == "" {
			// Try to load account-specific region from config
			customRegion, err := configMgr.GetAccountRegion(ssoProfileName, acc.Name)
			if err == nil && customRegion != "" {
				region = customRegion
			} else {
				region = ssoDefaultRegion
			}
		}

		// Only include roles information if we're under the limit
		var description string
		if len(accounts) <= maxAccountsForRoleLoading {
			description = fmt.Sprintf("Account ID: %s, Region: %s, Roles: %s", acc.AccountID, region, strings.Join(acc.Roles, ", "))
		} else {
			description = fmt.Sprintf("Account ID: %s, Region: %s", acc.AccountID, region)
		}

		accountItems[i] = item{
			title:       acc.Name,
			description: description,
		}
	}

	sortItems(accountItems)
	return accountItems
}

// Helper function to create role list items
func makeRoleItems(roles []string) []list.Item {
	roleItems := make([]list.Item, len(roles))
	for i, role := range roles {
		roleItems[i] = item{
			title:       role,
			description: fmt.Sprintf("Role: %s", role),
		}
	}

	sortItems(roleItems)
	return roleItems
}

func pollForSSOToken(info *aws.SSOLoginInfo, client *aws.Client, configMgr *config.Manager) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		token, err := client.CreateToken(ctx, info)

		if err != nil {
			var apiErr smithy.APIError
			if errors.As(err, &apiErr) {
				switch apiErr.ErrorCode() {
				case "AuthorizationPendingException":
					if time.Now().After(info.ExpiresAt) {
						return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out"), requestID: info.RequestID}
					}
					time.Sleep(2 * time.Second)
					return ssoTokenPollingTickMsg{info: info}

				case "SlowDownException":
					time.Sleep(2 * time.Second)
					return ssoTokenPollingTickMsg{info: info}

				case "ExpiredTokenException":
					return ssoLoginErrMsg{err: fmt.Errorf("device code expired"), requestID: info.RequestID}

				default:
					return ssoLoginErrMsg{err: fmt.Errorf("API error: %s - %s",
						apiErr.ErrorCode(), apiErr.ErrorMessage()), requestID: info.RequestID}
				}
			}

			if time.Now().After(info.ExpiresAt) {
				return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out"), requestID: info.RequestID}
			}

			time.Sleep(2 * time.Second)
			return ssoTokenPollingTickMsg{info: info}
		}

		if token != "" {
			expiresAt := time.Now().Add(8 * time.Hour)

			if err := configMgr.SaveToken(info.StartUrl, token, expiresAt); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to save token to cache: %v\n", err)
			}

			return ssoLoginSuccessMsg{accessToken: token, requestID: info.RequestID}
		}

		time.Sleep(2 * time.Second)
		return ssoTokenPollingTickMsg{info: info}
	}
}

// Fetch AWS accounts
func fetchAccounts(client *aws.Client, accessToken string, requestID string, existingAccounts []aws.Account) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		accounts, err := client.ListAccounts(ctx, accessToken, existingAccounts)
		if err != nil {
			return fetchAccountsErrMsg{err: err, requestID: requestID}
		}

		return fetchAccountsSuccessMsg{accounts: accounts, requestID: requestID}
	}
}

// Get credentials for a role
func getRoleCredentials(client *aws.Client, accessToken, accountID, roleName string, selectedAcc *aws.Account, ssoDefaultRegion string, requestID string) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		resp, err := client.GetRoleCredentials(ctx, accessToken, accountID, roleName)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to get role credentials: %w", err), requestID: requestID}
		}

		// Determine the effective region: account-specific region first, then SSO default region
		region := ssoDefaultRegion
		if selectedAcc != nil && selectedAcc.Region != "" {
			region = selectedAcc.Region
		}

		err = config.WriteCredentials(
			*resp.RoleCredentials.AccessKeyId,
			*resp.RoleCredentials.SecretAccessKey,
			*resp.RoleCredentials.SessionToken,
			region,
		)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to write credentials: %w", err), requestID: requestID}
		}

		return credentialsSetMsg{}
	}
}

func openBrowser(url string) tea.Cmd {
	return func() tea.Msg {
		if err := utils.OpenBrowser(url); err != nil {
			return browserOpenErrMsg{err: err}
		}
		return browserOpenSuccessMsg{}
	}
}

func loadAccountRoles(client *aws.Client, accessToken string, accountID string, currentIdx int) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()
		roles, err := client.LoadAccountRoles(ctx, accessToken, accountID)
		if err != nil {
			return loadRolesErrMsg{accountID: accountID, err: err}
		}
		return updateRolesMsg{accountID: accountID, roles: roles, currentIdx: currentIdx}
	}
}

type dynamicStyles struct {
	foreground     color.Color
	background     color.Color
	primaryColor   color.Color
	secondaryColor color.Color
	successColor   color.Color
	errorColor     color.Color
	mutedColor     color.Color
	textColor      color.Color

	// Base styles
	base lipgloss.Style // Basic style with dynamic fg/bg
	text lipgloss.Style // Style for general text

	// Text variants
	muted       lipgloss.Style
	primary     lipgloss.Style
	secondary   lipgloss.Style
	errorText   lipgloss.Style
	successText lipgloss.Style
	help        lipgloss.Style

	// Component styles
	title         lipgloss.Style
	pagination    lipgloss.Style
	spinner       lipgloss.Style
	button        lipgloss.Style
	buttonFocused lipgloss.Style
	listStyle     lipgloss.Style // Base container for lists

	// Input field styles
	inputFocusedPrompt      lipgloss.Style
	inputFocusedText        lipgloss.Style
	inputFocusedPlaceholder lipgloss.Style
	inputBlurredText        lipgloss.Style

	// Box styles
	errorBox        lipgloss.Style
	successBox      lipgloss.Style
	verificationBox lipgloss.Style
	codeBox         lipgloss.Style
	box             lipgloss.Style // General purpose box
}

func getDynamicStyles(bgIsDark bool) (s dynamicStyles) {
	lightDark := lipgloss.LightDark(bgIsDark)

	lightGray, darkGray := lipgloss.Color("#f1f1f1"), lipgloss.Color("#333333")
	background := lightDark(lightGray, darkGray)
	foreground := lightDark(darkGray, lightGray)

	// Define the color palette
	primaryColor := lipgloss.Color("#7D56F4")
	secondaryColor := lightDark(lipgloss.Color("#00F5FF"), lipgloss.Color("#FF9F9F"))
	successColor := lipgloss.Color("#00E680")
	errorColor := lipgloss.Color("#FF4D4D")
	mutedColor := lipgloss.Color("#6B7280")
	textColor := foreground

	s.foreground = foreground
	s.background = background
	s.textColor = textColor
	s.mutedColor = mutedColor
	s.primaryColor = primaryColor
	s.secondaryColor = secondaryColor
	s.successColor = successColor
	s.errorColor = errorColor

	s.base = lipgloss.NewStyle().
		Foreground(foreground)
	s.text = lipgloss.NewStyle().
		Foreground(foreground)

	s.muted = lipgloss.NewStyle().
		Foreground(mutedColor)
	s.primary = lipgloss.NewStyle().
		Foreground(primaryColor)
	s.secondary = lipgloss.NewStyle().
		Foreground(secondaryColor)
	s.errorText = lipgloss.NewStyle().
		Foreground(errorColor)
	s.successText = lipgloss.NewStyle().
		Foreground(successColor)
	s.help = lipgloss.NewStyle().
		Foreground(mutedColor).
		Italic(true)

	s.title = lipgloss.NewStyle().
		Foreground(foreground).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(0, 1)
	s.pagination = lipgloss.NewStyle().
		Foreground(mutedColor)
	s.spinner = lipgloss.NewStyle().
		Foreground(primaryColor)
	s.button = lipgloss.NewStyle().
		Foreground(primaryColor).
		Padding(0, 1)
	s.buttonFocused = lipgloss.NewStyle().
		Foreground(secondaryColor).
		Padding(0, 1)
	s.listStyle = lipgloss.NewStyle()

	s.inputFocusedPrompt = lipgloss.NewStyle().
		Foreground(primaryColor)
	s.inputFocusedText = lipgloss.NewStyle().
		Foreground(foreground)
	s.inputFocusedPlaceholder = lipgloss.NewStyle().
		Foreground(secondaryColor) // Placeholder has secondary color when focused
	s.inputBlurredText = lipgloss.NewStyle().
		Foreground(primaryColor) // Blurred text uses primary color

	s.errorBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(errorColor).
		Padding(1)
	s.successBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(successColor).
		Padding(1)
	s.verificationBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(secondaryColor).
		Padding(1)
	s.codeBox = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(secondaryColor).
		Padding(1)
	s.box = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(secondaryColor).
		Padding(1)

	return s
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		tea.RequestBackgroundColor,
	)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.BackgroundColorMsg:
		m.dynamicStyles = getDynamicStyles(msg.IsDark())

		// Update list titles
		m.ssoList.Styles.Title = m.dynamicStyles.title
		m.accountList.Styles.Title = m.dynamicStyles.title
		m.roleList.Styles.Title = m.dynamicStyles.title

		// Update input styles
		for i := range m.inputs {
			m.inputs[i].Styles.Focused.Text = m.dynamicStyles.inputFocusedText
			m.inputs[i].Styles.Focused.Prompt = m.dynamicStyles.inputFocusedPrompt
			m.inputs[i].Styles.Focused.Placeholder = m.dynamicStyles.inputFocusedPlaceholder
			m.inputs[i].Styles.Blurred.Text = m.dynamicStyles.inputBlurredText
		}
		m.accountRegionInput.Styles.Focused.Text = m.dynamicStyles.inputFocusedText
		m.accountRegionInput.Styles.Focused.Prompt = m.dynamicStyles.inputFocusedPrompt
		m.accountRegionInput.Styles.Focused.Placeholder = m.dynamicStyles.inputFocusedPlaceholder
		m.accountRegionInput.Styles.Blurred.Text = m.dynamicStyles.inputBlurredText

		// Update spinner style
		m.spinner.Style = m.dynamicStyles.spinner

		// Update list pagination/help styles (if they depend on dynamic colors)
		m.ssoList.Styles.PaginationStyle = m.dynamicStyles.pagination
		m.ssoList.Styles.HelpStyle = m.dynamicStyles.help
		m.accountList.Styles.PaginationStyle = m.dynamicStyles.pagination
		m.accountList.Styles.HelpStyle = m.dynamicStyles.help
		m.roleList.Styles.PaginationStyle = m.dynamicStyles.pagination
		m.roleList.Styles.HelpStyle = m.dynamicStyles.help

		return m, nil

	case tea.WindowSizeMsg:
		// Ensure minimum dimensions
		if msg.Width < 80 {
			msg.Width = 80
		}
		if msg.Height < 10 {
			msg.Height = 10
		}

		m.width = msg.Width
		m.height = msg.Height

		// Calculate content area dimensions
		contentWidth := msg.Width - 2
		contentHeight := msg.Height - 2

		// Update list dimensions to use full width and height
		m.ssoList.SetWidth(contentWidth)
		m.ssoList.SetHeight(contentHeight)

		m.accountList.SetWidth(contentWidth)
		m.accountList.SetHeight(contentHeight)

		m.roleList.SetWidth(contentWidth)
		m.roleList.SetHeight(contentHeight)

	case tea.KeyMsg:
		// Check if it's a key press message
		keyPress, isKeyPress := msg.(tea.KeyPressMsg)
		if !isKeyPress {
			// If it's not a key press (could be release), ignore for now or handle separately if needed
			return m, nil
		}

		// Global keybindings
		switch keyPress.String() {
		case "ctrl+c":
			// Only clear cached token if we haven't set up a session
			if m.selectedSSO != nil && m.selectedAcc == nil {
				if err := m.configMgr.SaveToken(m.selectedSSO.StartURL, "", time.Now()); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: Failed to clear token cache: %v\n", err)
				}
			}

			// Print session information if we have an active session
			if m.selectedAcc != nil && m.selectedAcc.SelectedRole != "" {
				// Use account-specific region if available, otherwise use SSO default
				region := m.selectedAcc.Region
				if region == "" {
					region = m.selectedSSO.DefaultRegion
				}
				details := lipgloss.NewStyle().
					Border(lipgloss.RoundedBorder()).
					Padding(1).
					BorderForeground(m.dynamicStyles.successColor).
					Render(
						lipgloss.JoinVertical(lipgloss.Left,
							fmt.Sprintf("SSO Profile: %s", m.dynamicStyles.primary.Render(m.selectedSSO.Name)),
							fmt.Sprintf("Account: %s (%s)", m.dynamicStyles.primary.Render(m.selectedAcc.Name), m.dynamicStyles.muted.Render(m.selectedAcc.AccountID)),
							fmt.Sprintf("Role: %s", m.dynamicStyles.primary.Render(m.selectedAcc.SelectedRole)),
							fmt.Sprintf("Region: %s", m.dynamicStyles.primary.Render(region)),
						),
					)
				fmt.Printf("\n%s\n\n", details)
			}

			return m, tea.Quit

		case "q":
			if m.state != stateAddSSO && m.state != stateEditSSO && m.state != stateDeleteConfirm {
				// Only clear cached token if we haven't set up a session
				if m.selectedSSO != nil && m.selectedAcc == nil {
					if err := m.configMgr.SaveToken(m.selectedSSO.StartURL, "", time.Now()); err != nil {
						fmt.Fprintf(os.Stderr, "Warning: Failed to clear token cache: %v\n", err)
					}
				}

				// Print session information if we have an active session with a role selected
				if m.selectedAcc != nil && m.selectedAcc.SelectedRole != "" {
					// Use account-specific region if available, otherwise use SSO default region
					region := m.selectedAcc.Region
					if region == "" {
						region = m.selectedSSO.DefaultRegion
					}
					details := lipgloss.NewStyle().
						Border(lipgloss.RoundedBorder()).
						Padding(1).
						BorderForeground(m.dynamicStyles.successColor).
						Render(
							lipgloss.JoinVertical(lipgloss.Left,
								fmt.Sprintf("SSO Profile: %s", m.dynamicStyles.primary.Render(m.selectedSSO.Name)),
								fmt.Sprintf("Account: %s (%s)", m.dynamicStyles.primary.Render(m.selectedAcc.Name), m.dynamicStyles.muted.Render(m.selectedAcc.AccountID)),
								fmt.Sprintf("Role: %s", m.dynamicStyles.primary.Render(m.selectedAcc.SelectedRole)),
								fmt.Sprintf("Region: %s", m.dynamicStyles.primary.Render(region)),
							),
						)
					fmt.Printf("\n%s\n\n", details)
				}

				return m, tea.Quit
			}

		case "esc":
			switch m.state {
			case stateSelectAccount:
				// Only handle escape if we're not filtering
				if m.accountList.FilterState() != list.Filtering {
					// Cancel any ongoing fetch by clearing the request ID
					m.currentRequestID = ""
					m.state = stateSelectSSO
					m.errorMessage = ""
					// Clear the filter when leaving the view
					m.accountList.ResetFilter()
					return m, nil
				}

			case stateSelectRole:
				// Only handle escape if we're not filtering
				if m.roleList.FilterState() != list.Filtering {
					m.state = stateSelectAccount
					// Clear the filter when leaving the view
					m.roleList.ResetFilter()
					return m, nil
				}

			case stateSessionSuccess:
				m.state = stateSelectAccount
				return m, nil

			case stateAddSSO, stateEditSSO:
				// Reset form
				m.inputs = initialInputs(m.dynamicStyles)
				m.focusIndex = 0
				m.formError = ""
				m.formSuccess = ""
				m.editingIndex = -1
				m.state = stateSelectSSO
				// Clear the filter when returning to SSO list
				m.ssoList.ResetFilter()
				return m, nil

			case stateDeleteConfirm:
				m.state = stateSelectSSO
				m.deleteProfileName = ""
				// Clear the filter when returning to SSO list
				m.ssoList.ResetFilter()
				return m, nil

			case stateSetAccountRegion:
				m.state = stateSelectAccount
				return m, nil
			}

		case "r":
			if m.state == stateSelectAccount && m.accountList.FilterState() != list.Filtering {
				if i, ok := m.accountList.SelectedItem().(item); ok {
					for idx, acc := range m.accounts {
						if acc.Name == i.Title() {
							m.selectedAcc = &m.accounts[idx]
							// Load existing region if any
							if region, err := m.configMgr.GetAccountRegion(m.selectedSSO.Name, m.selectedAcc.Name); err == nil {
								m.accountRegionInput.SetValue(region)
							}
							m.state = stateSetAccountRegion
							return m, m.accountRegionInput.Focus()
						}
					}
				}
			}

		// Add check for 'c' key press to copy verification code
		case "c":
			if m.state == stateSelectAccount && m.verificationCode != "" {
				return m, tea.SetClipboard(m.verificationCode)
			}

		case "o":
			if m.state == stateSelectSSO && m.ssoList.FilterState() != list.Filtering {
				if i, ok := m.ssoList.SelectedItem().(item); ok {
					for _, profile := range m.ssoProfiles {
						if profile.Name == i.Title() {
							url := m.awsClient.GetDashboardURL(profile.StartURL)
							return m, openBrowser(url)
						}
					}
				}
			} else if m.state == stateSelectAccount && m.accountList.FilterState() != list.Filtering {
				if i, ok := m.accountList.SelectedItem().(item); ok {
					for _, acc := range m.accounts {
						if acc.Name == i.Title() {
							// Attempt to get the last used role for this account/profile
							roleName, err := m.configMgr.GetLastSelectedRole(m.selectedSSO.Name, acc.Name)
							if err != nil || roleName == "" {
								// Fallback: Use the first available role, or AdministratorAccess
								roleName = "AdministratorAccess"
								if len(acc.Roles) > 0 {
									roleName = acc.Roles[0]
								}
							}
							url := m.awsClient.GetAccountURL(acc.AccountID, m.accessToken, m.selectedSSO.StartURL, roleName)
							return m, openBrowser(url)
						}
					}
				}
			} else if m.state == stateSelectRole && m.roleList.FilterState() != list.Filtering {
				if i, ok := m.roleList.SelectedItem().(item); ok {
					roleName := i.Title()
					if m.selectedAcc != nil && m.selectedSSO != nil && m.accessToken != "" {
						url := m.awsClient.GetAccountURL(m.selectedAcc.AccountID, m.accessToken, m.selectedSSO.StartURL, roleName)
						return m, openBrowser(url)
					}
				}
			}
		}

		// State-specific logic
		switch m.state {
		case stateSelectSSO:
			// Only process special keybindings if we're not filtering
			if m.ssoList.FilterState() != list.Filtering {
				switch keyPress.String() {
				case "a":
					// Switch to add SSO form
					m.state = stateAddSSO
					m.formError = ""
					m.formSuccess = ""
					m.inputs = initialInputs(m.dynamicStyles)
					m.focusIndex = 0
					// Clear the filter when leaving the view
					m.ssoList.ResetFilter()
					return m, nil

				case "e":
					// Edit selected SSO only if profiles exist
					if len(m.ssoProfiles) > 0 {
						if i, ok := m.ssoList.SelectedItem().(item); ok {
							for idx, profile := range m.ssoProfiles {
								if profile.Name == i.Title() {
									// Initialize form with existing values
									m.editingIndex = idx
									m.state = stateEditSSO
									m.formError = ""
									m.formSuccess = ""
									m.inputs = initialInputs(m.dynamicStyles)

									// Extract company name from URL
									companyName := strings.TrimPrefix(profile.StartURL, "https://")
									companyName = strings.TrimSuffix(companyName, ".awsapps.com/start")

									// Set values from selected profile
									m.inputs[0].SetValue(profile.Name)
									m.inputs[1].SetValue(companyName)
									m.inputs[2].SetValue(profile.SSORegion)
									m.inputs[3].SetValue(profile.DefaultRegion)

									m.focusIndex = 0
									// Clear the filter when leaving the view
									m.ssoList.ResetFilter()
									return m, nil
								}
							}
						}
					}

				case "d":
					// Delete selected SSO only if profiles exist
					if len(m.ssoProfiles) > 0 {
						if i, ok := m.ssoList.SelectedItem().(item); ok {
							m.deleteProfileName = i.Title()
							m.state = stateDeleteConfirm
							// Clear the filter when leaving the view
							m.ssoList.ResetFilter()
							return m, nil
						}
					}

				case "enter":
					// Only proceed if profiles exist
					if len(m.ssoProfiles) > 0 {
						i, ok := m.ssoList.SelectedItem().(item)
						if ok {
							for _, profile := range m.ssoProfiles {
								if profile.Name == i.Title() {
									// Generate a new request ID for this SSO operation
									newRequestID := fmt.Sprintf("%s-%d", profile.Name, time.Now().UnixNano())
									m.currentRequestID = newRequestID

									// Check if we're switching to a different SSO profile
									if m.selectedSSO == nil || m.selectedSSO.Name != profile.Name {
										// Clear accounts and reset list when switching profiles
										m.accounts = nil
										m.accountList.SetItems([]list.Item{})
										m.usingCachedAccounts = false
										// Reset the account list title
										m.accountList.Title = "Select AWS Account"
									}

									m.selectedSSO = &profile
									m.isAuthenticating = true

									// Initialize AWS client for the selected SSO region
									var err error
									m.awsClient, err = aws.NewClient(profile.SSORegion)
									if err != nil {
										m.errorMessage = fmt.Sprintf("Failed to initialize AWS client: %v", err)
										return m, nil
									}

									// Load cached accounts if they exist
									cachedAccounts, lastUpdated, err := m.configMgr.LoadCachedAccounts(profile.StartURL)
									if err != nil {
										fmt.Fprintf(os.Stderr, "Warning: Failed to load cached accounts: %v\n", err)
									}

									// If we have cached accounts, use them
									if len(cachedAccounts) > 0 {
										m.accounts = cachedAccounts
										m.accountsLastUpdated = lastUpdated
										m.usingCachedAccounts = true

										// Update the account list items
										for i := range m.accounts {
											acc := &m.accounts[i]
											if customRegion, err := m.configMgr.GetAccountRegion(m.selectedSSO.Name, acc.Name); err == nil && customRegion != "" {
												acc.Region = customRegion
											}
										}
										accountItems := makeAccountItems(m.accounts, m.selectedSSO.DefaultRegion, m.configMgr, m.selectedSSO.Name)
										m.accountList.Title = fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
										m.accountList.SetItems(accountItems)

										// Try to select the previously selected account if it exists
										m.selectLastUsedAccount(profile.Name)
									}

									// Move to account selection state immediately
									m.state = stateSelectAccount
									m.loadingText = "Starting SSO login process..."
									// Clear the filter when leaving the view
									m.ssoList.ResetFilter()

									// Save the selected profile as last used *before* starting login
									go func(name string) {
										if err := m.configMgr.SaveLastSelectedSSOProfile(name); err != nil {
											fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected SSO profile: %v\n", err)
										}
									}(profile.Name)

									return m, startSSOLogin(profile.StartURL, m.configMgr, m.awsClient, m.currentRequestID)
								}
							}
						}
					}
				}
			}

		case stateDeleteConfirm:
			switch keyPress.String() {
			case "y":
				// Delete the profile
				for idx, profile := range m.ssoProfiles {
					if profile.Name == m.deleteProfileName {
						m.ssoProfiles = slices.Delete(m.ssoProfiles, idx, idx+1)

						m.updateSSOList()

						// Save the updated profiles
						if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
							m.errorMessage = fmt.Sprintf("Failed to save SSO profiles: %v", err)
							return m, nil
						}
						break
					}
				}
				m.state = stateSelectSSO
				m.deleteProfileName = ""
				return m, nil

			case "n":
				m.state = stateSelectSSO
				m.deleteProfileName = ""
				return m, nil
			}

		case stateSelectAccount:
			// Only process enter key if we're not filtering
			if m.accountList.FilterState() != list.Filtering && keyPress.String() == "enter" {
				i, ok := m.accountList.SelectedItem().(item)
				if ok {
					for idx, acc := range m.accounts {
						if acc.Name == i.Title() {
							m.selectedAcc = &m.accounts[idx]
							// Cancel any ongoing fetch by clearing the request ID
							m.currentRequestID = ""

							// Save the selected account name for this SSO profile
							if m.selectedSSO != nil {
								go func() {
									if err := m.configMgr.SaveLastSelectedAccount(m.selectedSSO.Name, m.selectedAcc.Name); err != nil {
										fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected account: %v\n", err)
									}
								}()
							}

							// Move to role selection view
							m.state = stateSelectRole
							m.roleList.Title = fmt.Sprintf("Select Role for %s", m.selectedAcc.Name)

							// If roles are already loaded, show them
							if m.selectedAcc.RolesLoaded {
								roleItems := makeRoleItems(m.selectedAcc.Roles)
								m.roleList.SetItems(roleItems)
								// Try to select the previously selected role if it exists
								m.selectLastUsedRole(m.selectedSSO.Name, m.selectedAcc.Name)
								m.loadingText = ""
								return m, nil
							}

							// Load roles for this account only
							m.loadingText = fmt.Sprintf("Loading roles for %s...", m.selectedAcc.Name)
							return m, loadAccountRoles(m.awsClient, m.accessToken, m.selectedAcc.AccountID, idx)
						}
					}
				}
			}

		case stateSelectRole:
			// Only process special keybindings if we're not filtering and not loading
			if m.roleList.FilterState() != list.Filtering && m.loadingText == "" {
				switch keyPress.String() {
				case "enter":
					i, ok := m.roleList.SelectedItem().(item)
					if ok {
						// Set the selected role
						m.selectedAcc.SelectedRole = i.Title()

						// Save the selected role for this SSO profile and account
						if m.selectedSSO != nil {
							go func() {
								if err := m.configMgr.SaveLastSelectedRole(m.selectedSSO.Name, m.selectedAcc.Name, m.selectedAcc.SelectedRole); err != nil {
									fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected role: %v\n", err)
								}
							}()
						}

						// Get credentials for the selected role
						return m, getRoleCredentials(
							m.awsClient,
							m.accessToken,
							m.selectedAcc.AccountID,
							m.selectedAcc.SelectedRole,
							m.selectedAcc,
							m.selectedSSO.DefaultRegion,
							m.currentRequestID,
						)
					}

				case "o":
					if i, ok := m.roleList.SelectedItem().(item); ok {
						roleName := i.Title()
						if m.selectedAcc != nil && m.selectedSSO != nil && m.accessToken != "" {
							url := m.awsClient.GetAccountURL(m.selectedAcc.AccountID, m.accessToken, m.selectedSSO.StartURL, roleName)
							return m, openBrowser(url)
						}
					}
				}
			}

		case stateAddSSO, stateEditSSO:
			switch keyPress.String() {
			case "tab", "shift+tab", "enter", "up", "down":
				// Handle input navigation
				if keyPress.String() == "enter" && m.focusIndex == len(m.inputs) {
					// Submit form
					if m.state == stateAddSSO {
						return m.handleAddFormSubmission()
					} else {
						return m.handleEditFormSubmission()
					}
				}

				// Cycle through inputs
				if keyPress.String() == "up" || keyPress.String() == "shift+tab" {
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
						cmds = append(cmds, m.inputs[i].Focus())
					} else {
						m.inputs[i].Blur()
					}
				}

				return m, tea.Batch(cmds...)
			}

		case stateSetAccountRegion:
			if keyPress.String() == "enter" {
				region := strings.TrimSpace(m.accountRegionInput.Value())
				if region != "" {
					// Save the region for this account
					if err := m.configMgr.SaveAccountRegion(m.selectedSSO.Name, m.selectedAcc.Name, region); err != nil {
						m.errorMessage = fmt.Sprintf("Failed to save account region: %v", err)
						return m, nil
					}
					// Update the account's region in memory
					for idx, acc := range m.accounts {
						if acc.Name == m.selectedAcc.Name {
							m.accounts[idx].Region = region
							break
						}
					}
				} else {
					// Clear the region for this account
					if err := m.configMgr.SaveAccountRegion(m.selectedSSO.Name, m.selectedAcc.Name, ""); err != nil {
						m.errorMessage = fmt.Sprintf("Failed to clear account region: %v", err)
						return m, nil
					}
					// Update the account's region in memory to empty string
					for idx, acc := range m.accounts {
						if acc.Name == m.selectedAcc.Name {
							m.accounts[idx].Region = ""
							break
						}
					}
				}
				// Refresh the account list items to show the updated region
				accountItems := makeAccountItems(m.accounts, m.selectedSSO.DefaultRegion, m.configMgr, m.selectedSSO.Name)
				m.accountList.SetItems(accountItems)
				m.accountList.ResetFilter()
				m.state = stateSelectAccount
				return m, nil
			}
		}

	case *aws.SSOLoginInfo:
		// Ignore messages for outdated requests
		if msg.RequestID != m.currentRequestID {
			return m, nil
		}

		// Store verification info in the model for display
		m.verificationUri = msg.VerificationUri
		m.verificationUriComplete = msg.VerificationUriComplete
		m.verificationCode = msg.UserCode
		m.loadingText = "Waiting for browser authentication..."

		// Start polling for token
		return m, tea.Batch(
			pollForSSOToken(msg, m.awsClient, m.configMgr),
			m.spinner.Tick,
		)

	case ssoLoginSuccessMsg:
		// Ignore messages for outdated requests
		if msg.requestID != m.currentRequestID {
			return m, nil
		}

		m.accessToken = msg.accessToken
		m.loadingText = "SSO login successful! Fetching accounts..."
		m.errorMessage = ""
		m.isAuthenticating = false // Reset authentication flag
		return m, fetchAccounts(m.awsClient, m.accessToken, m.currentRequestID, m.accounts)

	case ssoLoginErrMsg:
		// Ignore messages for outdated requests
		if msg.requestID != m.currentRequestID {
			return m, nil
		}

		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case fetchAccountsSuccessMsg:
		// Ignore messages for outdated requests
		if msg.requestID != m.currentRequestID {
			return m, nil
		}

		// Save the accounts to cache
		if m.selectedSSO != nil {
			go func() {
				if err := m.configMgr.SaveCachedAccounts(m.selectedSSO.Name, m.selectedSSO.StartURL, msg.accounts); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: Failed to save accounts to cache: %v\n", err)
				}
			}()
		}

		// If we're using cached accounts, just update the accounts in memory
		// but don't change the view or state
		if m.usingCachedAccounts {
			m.accounts = msg.accounts
			m.accountList.Title = fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
			return m, nil
		}

		// For non-cached accounts, proceed with normal flow
		m.accounts = msg.accounts
		m.state = stateSelectAccount
		m.errorMessage = ""
		m.usingCachedAccounts = false
		m.loadingText = ""

		// Create account list items
		accountItems := makeAccountItems(m.accounts, m.selectedSSO.DefaultRegion, m.configMgr, m.selectedSSO.Name)

		// Update account list title with breadcrumb and role loading status
		title := fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
		m.accountList.Title = title
		m.accountList.SetItems(accountItems)

		// Try to select the previously selected account if it exists
		m.selectLastUsedAccount(m.selectedSSO.Name)

		// Start sequential role loading only if we're under the limit
		if len(m.accounts) <= maxAccountsForRoleLoading {
			return m, startLoadingRoles(m.accessToken, m.accounts)
		}
		return m, nil

	case fetchAccountsErrMsg:
		// Ignore messages for outdated requests
		if msg.requestID != m.currentRequestID {
			return m, nil
		}

		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case credentialsSetMsg:
		m.state = stateSessionSuccess
		return m, nil

	case ssoTokenPollingTickMsg:
		// Continue polling for token completion
		if time.Now().After(msg.info.ExpiresAt) {
			m.errorMessage = "Authentication timed out"
			m.state = stateSelectSSO
			return m, nil
		}

		// Update UI and continue polling
		m.loadingText = fmt.Sprintf("Waiting for authentication... (%.0fs remaining)",
			time.Until(msg.info.ExpiresAt).Seconds())

		// Only update the spinner every 500ms to avoid too rapid updates
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(spinner.TickMsg{})

		// Pass through the verification message with all fields including startUrl
		return m, tea.Batch(
			cmd,
			pollForSSOToken(msg.info, m.awsClient, m.configMgr),
		)

	case spinner.TickMsg:
		// Handle spinner ticks
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case browserOpenErrMsg:
		m.errorMessage = fmt.Sprintf("Failed to open browser: %v", msg.err)
		return m, nil

	case browserOpenSuccessMsg:
		// Browser opened successfully, no need to show any message
		return m, nil

	case loadRolesErrMsg:
		// Log the error but allow the user to continue
		fmt.Fprintf(os.Stderr, "Warning: Failed to load roles for account %s: %v\n", msg.accountID, msg.err)
		// Update the account to show the error
		for idx, acc := range m.accounts {
			if acc.AccountID == msg.accountID {
				m.accounts[idx].Roles = []string{"Error loading roles"}
				m.accounts[idx].RolesLoaded = true
				// Update the account list display
				accountItems := makeAccountItems(m.accounts, m.selectedSSO.DefaultRegion, m.configMgr, m.selectedSSO.Name)
				m.accountList.SetItems(accountItems)
				break
			}
		}
		m.loadingText = ""
		return m, nil

	case loadNextRoleMsg:
		if msg.currentIdx >= len(msg.accounts) {
			return m, nil
		}

		acc := msg.accounts[msg.currentIdx]
		if !acc.RolesLoaded {
			// Load roles for current account
			return m, loadAccountRoles(m.awsClient, msg.accessToken, acc.AccountID, msg.currentIdx)
		}

		// If current account is already loaded, move to next one
		return m, func() tea.Msg {
			return loadNextRoleMsg{
				accounts:    msg.accounts,
				currentIdx:  msg.currentIdx + 1,
				accessToken: msg.accessToken,
			}
		}

	case updateRolesMsg:
		// Update the roles for the account
		for idx, acc := range m.accounts {
			if acc.AccountID == msg.accountID {
				m.accounts[idx].Roles = msg.roles
				m.accounts[idx].RolesLoaded = true

				// Update the cached accounts in background
				if m.selectedSSO != nil {
					go func() {
						if err := m.configMgr.SaveCachedAccounts(m.selectedSSO.Name, m.selectedSSO.StartURL, m.accounts); err != nil {
							fmt.Fprintf(os.Stderr, "Warning: Failed to save accounts to cache: %v\n", err)
						}
					}()
				}

				// If this is the selected account, update its roles too
				if m.selectedAcc != nil && m.selectedAcc.AccountID == msg.accountID {
					m.selectedAcc = &m.accounts[idx]
					roleItems := makeRoleItems(msg.roles)
					m.roleList.SetItems(roleItems)
					m.selectLastUsedRole(m.selectedSSO.Name, m.selectedAcc.Name)
					m.loadingText = "" // Clear loading text
				}

				// Update the account list display
				accountItems := makeAccountItems(m.accounts, m.selectedSSO.DefaultRegion, m.configMgr, m.selectedSSO.Name)
				m.accountList.SetItems(accountItems)
				break
			}
		}

		// Only continue loading next account if we're under the limit
		if len(m.accounts) <= maxAccountsForRoleLoading {
			return m, func() tea.Msg {
				return loadNextRoleMsg{
					accounts:    m.accounts,
					currentIdx:  msg.currentIdx + 1,
					accessToken: m.accessToken,
				}
			}
		}
		return m, nil
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

	case stateSelectRole:
		var cmd tea.Cmd
		m.roleList, cmd = m.roleList.Update(msg)
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

	case stateSetAccountRegion:
		var cmd tea.Cmd
		m.accountRegionInput, cmd = m.accountRegionInput.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m *model) selectLastUsedAccount(profileName string) {
	if profileName == "" {
		return
	}

	lastAccount, err := m.configMgr.GetLastSelectedAccount(profileName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to get last selected account: %v\n", err)
		return
	}

	if lastAccount == "" {
		return
	}

	// Find the account in the list and select it
	for i, acc := range m.accounts {
		if acc.Name == lastAccount {
			m.accountList.Select(i)
			break
		}
	}
}

func (m *model) selectLastUsedRole(profileName, accountName string) {
	if profileName == "" || accountName == "" {
		return
	}

	lastRole, err := m.configMgr.GetLastSelectedRole(profileName, accountName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to get last selected role: %v\n", err)
		return
	}

	if lastRole == "" {
		return
	}

	// Find the role in the list and select it
	for i, listItem := range m.roleList.Items() {
		if listItem.(item).Title() == lastRole {
			m.roleList.Select(i)
			break
		}
	}
}

func validateSSOForm(alias, companyName, ssoRegion, defaultRegion string) string {
	if alias == "" {
		return "Alias cannot be empty"
	}
	if companyName == "" {
		return "Company name cannot be empty"
	}
	if ssoRegion == "" {
		return "SSO Region cannot be empty"
	}
	if defaultRegion == "" {
		return "Default Region cannot be empty"
	}
	return ""
}

func (m *model) handleAddFormSubmission() (tea.Model, tea.Cmd) {
	alias := strings.TrimSpace(m.inputs[0].Value())
	companyName := strings.TrimSpace(m.inputs[1].Value())
	ssoRegion := strings.TrimSpace(m.inputs[2].Value())
	defaultRegion := strings.TrimSpace(m.inputs[3].Value())

	if err := validateSSOForm(alias, companyName, ssoRegion, defaultRegion); err != "" {
		m.formError = err
		return m, nil
	}

	portalURL := fmt.Sprintf("https://%s.awsapps.com/start", companyName)

	for _, profile := range m.ssoProfiles {
		if profile.Name == alias {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	newProfile := config.SSOProfile{
		Name:          alias,
		StartURL:      portalURL,
		SSORegion:     ssoRegion,
		DefaultRegion: defaultRegion,
	}

	m.ssoProfiles = append(m.ssoProfiles, newProfile)
	m.updateSSOList()

	// Save profiles to config file
	if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
		m.formError = fmt.Sprintf("Failed to save SSO profiles: %v", err)
		return m, nil
	}

	// Reset form and return to SSO selection screen
	m.inputs = initialInputs(m.dynamicStyles)
	m.focusIndex = 0
	m.formError = ""
	m.state = stateSelectSSO

	return m, nil
}

func (m *model) handleEditFormSubmission() (tea.Model, tea.Cmd) {
	alias := strings.TrimSpace(m.inputs[0].Value())
	companyName := strings.TrimSpace(m.inputs[1].Value())
	ssoRegion := strings.TrimSpace(m.inputs[2].Value())
	defaultRegion := strings.TrimSpace(m.inputs[3].Value())

	if err := validateSSOForm(alias, companyName, ssoRegion, defaultRegion); err != "" {
		m.formError = err
		return m, nil
	}

	portalURL := fmt.Sprintf("https://%s.awsapps.com/start", companyName)

	for idx, profile := range m.ssoProfiles {
		if profile.Name == alias && idx != m.editingIndex {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	m.ssoProfiles[m.editingIndex] = config.SSOProfile{
		Name:          alias,
		StartURL:      portalURL,
		SSORegion:     ssoRegion,
		DefaultRegion: defaultRegion,
	}

	m.updateSSOList()
	m.formSuccess = "SSO profile updated successfully!"
	m.formError = ""

	// Save profiles to config file
	if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
		m.formError = fmt.Sprintf("Failed to save SSO profiles: %v", err)
		return m, nil
	}

	// Reset form and return to SSO selection screen
	m.inputs = initialInputs(m.dynamicStyles)
	m.focusIndex = 0
	m.formError = ""
	m.formSuccess = ""
	m.editingIndex = -1
	m.state = stateSelectSSO

	return m, nil
}

func (m *model) updateSSOList() {
	// Update SSO list items
	ssoItems := make([]list.Item, len(m.ssoProfiles))
	for i, profile := range m.ssoProfiles {
		ssoItems[i] = item{
			title:       profile.Name,
			description: fmt.Sprintf("SSO Region: %s, Default Region: %s", profile.SSORegion, profile.DefaultRegion),
		}
	}
	m.ssoList.SetItems(ssoItems)
}

func (m model) renderLoadingView() string {
	loading := lipgloss.JoinHorizontal(lipgloss.Center,
		m.spinner.View(),
		" "+m.dynamicStyles.text.Render(m.loadingText),
	)
	return lipgloss.Place(m.width, m.height,
		lipgloss.Center, lipgloss.Center,
		loading,
	)
}

func (m model) View() (string, *tea.Cursor) {
	var s string
	var cur *tea.Cursor

	// If there's an error message, show it at the bottom
	errorBar := ""
	if m.errorMessage != "" {
		errorBar = "\n" + m.dynamicStyles.errorBox.Render(m.errorMessage)
	}

	var content string

	switch m.state {
	case stateSelectSSO:
		content = m.dynamicStyles.listStyle.Render(m.ssoList.View())

	case stateDeleteConfirm:
		header := m.dynamicStyles.title.Margin(0, 2).Render("Delete SSO Profile")

		confirmationText := lipgloss.JoinVertical(
			lipgloss.Center,
			fmt.Sprintf("Are you sure you want to delete the SSO profile '%s'?", m.dynamicStyles.text.Render(m.deleteProfileName)),
			"",
			lipgloss.JoinHorizontal(lipgloss.Left,
				m.dynamicStyles.muted.Render("Press "),
				m.dynamicStyles.successText.Render("'y'"),
				m.dynamicStyles.muted.Render(" to confirm or "),
				m.dynamicStyles.errorText.Render("'n'"),
				m.dynamicStyles.muted.Render(" to cancel"),
			),
		)
		content = lipgloss.JoinVertical(lipgloss.Left, header, m.dynamicStyles.box.Render(confirmationText))

	case stateSelectAccount:
		// Show auth screen when authenticating or fetching initial accounts
		if m.isAuthenticating || (len(m.accounts) == 0 && m.loadingText != "") {
			if m.verificationUri != "" && m.verificationCode != "" {
				// Show verification screen
				verificationContent := lipgloss.JoinVertical(lipgloss.Center,
					m.dynamicStyles.text.Render("Your browser should open automatically for SSO login."),
					m.dynamicStyles.text.Render("If it doesn't, you can authenticate manually:"),
					"",
					fmt.Sprintf("1. Visit: %s", m.dynamicStyles.primary.Render(m.verificationUri)),
					m.dynamicStyles.text.Render("2. Enter the following code:"),
					"",
					m.dynamicStyles.codeBox.Render(m.verificationCode),
					"",
					m.dynamicStyles.help.Render("You can also click the link below to open directly:"),
					m.dynamicStyles.primary.Render(m.verificationUriComplete),
					"",
					lipgloss.JoinHorizontal(lipgloss.Center,
						m.spinner.View(),
						" "+m.dynamicStyles.text.Render(m.loadingText),
					),
				)
				instructions := m.dynamicStyles.verificationBox.Align(lipgloss.Center).Render(verificationContent)
				content = lipgloss.JoinVertical(lipgloss.Left,
					instructions,
				)
			} else {
				// Show loading spinner
				content = m.renderLoadingView()
			}
		} else {
			content = m.dynamicStyles.listStyle.Render(m.accountList.View())
		}

	case stateSelectRole:
		if m.loadingText != "" {
			// Show loading spinner while fetching roles
			content = m.renderLoadingView()
		} else {
			content = m.dynamicStyles.listStyle.Render(m.roleList.View())
		}

	case stateSessionSuccess:
		// Add the header back
		header := m.dynamicStyles.title.Padding(0, 1).Margin(0, 1).Render("AWS Session Activated")

		// Determine region: account-specific > SSO default
		region := m.selectedSSO.DefaultRegion
		if m.selectedAcc.Region != "" {
			region = m.selectedAcc.Region
		}

		// Use the simplified details format
		detailsContent := lipgloss.JoinVertical(lipgloss.Left,
			fmt.Sprintf("SSO Profile: %s", m.dynamicStyles.primary.Render(m.selectedSSO.Name)),
			fmt.Sprintf("Account: %s (%s)", m.dynamicStyles.primary.Render(m.selectedAcc.Name), m.dynamicStyles.muted.Render(m.selectedAcc.AccountID)),
			fmt.Sprintf("Role: %s", m.dynamicStyles.primary.Render(m.selectedAcc.SelectedRole)),
			fmt.Sprintf("Region: %s", m.dynamicStyles.primary.Render(region)),
		)
		details := m.dynamicStyles.successBox.Render(detailsContent)

		// Display header, details box, and help text
		helpText := m.dynamicStyles.help.Render("Press ESC to go back or q to quit.")
		content = m.dynamicStyles.base.Margin(0, 1).Render(lipgloss.JoinVertical(lipgloss.Left, header, details, helpText))

	case stateAddSSO, stateEditSSO:
		var formTitle string
		if m.state == stateAddSSO {
			formTitle = m.dynamicStyles.title.MarginLeft(2).MarginBottom(1).Render("Add New AWS SSO Profile")
		} else {
			formTitle = m.dynamicStyles.title.MarginLeft(2).MarginBottom(1).Render("Edit AWS SSO Profile")
		}

		fields := []string{
			"Alias (friendly name):",
			"Company Name (e.g. 'mycompany' from mycompany.awsapps.com):",
			"SSO Region:",
			"Default Region:",
		}

		var formContent strings.Builder

		for i, field := range fields {
			input := m.inputs[i].View()
			if i == m.focusIndex {
				// Use primary style for focused label
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", m.dynamicStyles.primary.Render(field), input))
			} else {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", m.dynamicStyles.muted.Render(field), input))
			}
		}

		button := m.dynamicStyles.button.Render("[ Submit ]")
		if m.focusIndex == len(m.inputs) {
			button = m.dynamicStyles.buttonFocused.Render("[ Submit ]")
		}
		formContent.WriteString(button + "\n\n")

		if m.formError != "" {
			formContent.WriteString(m.dynamicStyles.errorText.Render(m.formError) + "\n\n")
		}

		formContent.WriteString(m.dynamicStyles.help.Render("Press ESC to cancel"))

		content = lipgloss.JoinVertical(lipgloss.Left, formTitle, formContent.String())

		if m.focusIndex < len(m.inputs) {
			input := m.inputs[m.focusIndex]

			cursorY := 6 + (m.focusIndex * 3)
			cursorX := input.Cursor().X + 2

			maxCursorX := len(input.Prompt) + input.Width()
			if cursorX > maxCursorX {
				cursorX = maxCursorX
			}

			cur = tea.NewCursor(cursorX, cursorY)
			cur.Shape = tea.CursorBar
			cur.Blink = true
		}

	case stateSetAccountRegion:
		header := m.dynamicStyles.title.Margin(0, 2).Render("Set Account Region")

		regionContent := lipgloss.JoinVertical(
			lipgloss.Center,
			m.dynamicStyles.text.Render("Set region for account:"),
			m.dynamicStyles.primary.Render(m.selectedAcc.Name),
			"",
			m.accountRegionInput.View(),
		)
		content = lipgloss.JoinVertical(lipgloss.Left, header, m.dynamicStyles.box.Render(regionContent), m.dynamicStyles.help.Render("Press Enter to save or ESC to cancel"))

		input := m.accountRegionInput

		cursorY := 9
		cursorX := len(input.Prompt) + input.Cursor().X

		cur = tea.NewCursor(cursorX, cursorY)
		cur.Shape = tea.CursorBar
		cur.Blink = true
	}

	// Apply base style and margin
	s = m.dynamicStyles.base.Margin(1, 2).Render(content)

	return s + errorBar, cur
}

// DirectSessionSetup handles setting up a session directly from command line arguments
func directSessionSetup(ssoName, accountName, roleNameArg string, browserFlag bool, regionFlag string) error {
	// Create config manager
	configMgr, err := config.NewManager()
	if err != nil {
		return fmt.Errorf("failed to initialize config manager: %w", err)
	}

	// Load profiles
	profiles, err := configMgr.LoadProfiles()
	if err != nil {
		return fmt.Errorf("failed to load SSO profiles: %w", err)
	}

	// Find the specified SSO profile
	var selectedProfile *config.SSOProfile
	for _, profile := range profiles {
		if profile.Name == ssoName {
			selectedProfile = &profile
			break
		}
	}
	if selectedProfile == nil {
		return fmt.Errorf("SSO profile '%s' not found", ssoName)
	}

	// Initialize AWS client using the SSO Region
	awsClient, err := aws.NewClient(selectedProfile.SSORegion)
	if err != nil {
		return fmt.Errorf("failed to initialize AWS client: %w", err)
	}

	// Create default styles for CLI output (assuming dark background)
	cliStyles := getDynamicStyles(true)

	// Check for cached token first
	var accessToken string
	cachedToken, err := configMgr.LoadToken(selectedProfile.StartURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to check token cache: %v\n", err)
	}

	if cachedToken != nil {
		accessToken = cachedToken.AccessToken
	} else {
		// Start SSO login process if no valid cached token
		ctx := context.Background()
		loginInfo, err := awsClient.StartSSOLogin(ctx, selectedProfile.StartURL)
		if err != nil {
			return fmt.Errorf("failed to start SSO login: %w", err)
		}

		// Render the verification instructions using the TUI style
		verificationContent := lipgloss.JoinVertical(
			lipgloss.Center,
			cliStyles.text.Render("Your browser should open automatically for SSO login."),
			cliStyles.text.Render("If it doesn't, you can authenticate manually:"),
			"",
			fmt.Sprintf("1. Visit: %s", cliStyles.text.Render(loginInfo.VerificationUri)),
			cliStyles.text.Render("2. Enter the following code:"),
			"",
			cliStyles.codeBox.Render(loginInfo.UserCode),
			"",
			cliStyles.help.Render("You can also click the link below to open directly:"),
			cliStyles.text.Render(loginInfo.VerificationUriComplete),
		)
		verificationInstructions := cliStyles.verificationBox.Align(lipgloss.Center).Render(verificationContent)
		fmt.Println(verificationInstructions)

		// Open browser for login (attempt it silently)
		if err := utils.OpenBrowser(loginInfo.VerificationUriComplete); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to open browser automatically: %v\n", err)
		}

		// Poll for token
		pollingCtx, cancel := context.WithTimeout(ctx, time.Until(loginInfo.ExpiresAt))
		defer cancel()

		ticker := time.NewTicker(time.Duration(loginInfo.Interval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-pollingCtx.Done():
				fmt.Println("\nAuthentication timed out.")
				return fmt.Errorf("authentication timed out")

			case <-ticker.C:
				token, err := awsClient.CreateToken(pollingCtx, loginInfo)
				if err != nil {
					var apiErr smithy.APIError
					if errors.As(err, &apiErr) {
						switch apiErr.ErrorCode() {
						case "AuthorizationPendingException", "SlowDownException":
							// Continue polling
							continue

						case "ExpiredTokenException":
							fmt.Println("\nDevice code expired.")
							return fmt.Errorf("device code expired")

						default:
							fmt.Printf("\nAPI error: %s - %s\n", apiErr.ErrorCode(), apiErr.ErrorMessage())
							return fmt.Errorf("API error: %s - %s", apiErr.ErrorCode(), apiErr.ErrorMessage())
						}
					}
					// Handle context deadline exceeded separately
					if errors.Is(err, context.DeadlineExceeded) {
						fmt.Println("\nAuthentication timed out.")
						return fmt.Errorf("authentication timed out")
					}
					fmt.Printf("\nFailed to create token: %v\n", err)
					return fmt.Errorf("failed to create token: %w", err)
				}
				if token != "" {
					accessToken = token
					// Save the token to cache
					if err := configMgr.SaveToken(selectedProfile.StartURL, token, time.Now().Add(8*time.Hour)); err != nil {
						fmt.Fprintf(os.Stderr, "Warning: Failed to save token to cache: %v\n", err)
					}
					goto AuthComplete
				}
			}
		}
	AuthComplete:
	}

	if accessToken == "" {
		return fmt.Errorf("failed to obtain access token")
	}

	// List accounts
	ctx := context.Background()
	accounts, err := awsClient.ListAccounts(ctx, accessToken, nil)
	if err != nil {
		return fmt.Errorf("failed to list accounts: %w", err)
	}

	// Find the specified account
	var selectedAccount *aws.Account
	for i := range accounts {
		if accounts[i].Name == accountName {
			selectedAccount = &accounts[i]
			break
		}
	}
	if selectedAccount == nil {
		return fmt.Errorf("account '%s' not found", accountName)
	}

	// Load roles for the account (needed for validation if roleNameArg is provided)
	roles, err := awsClient.LoadAccountRoles(ctx, accessToken, selectedAccount.AccountID)
	if err != nil {
		// Log warning if loading roles fails, but proceed if roleNameArg is given
		if roleNameArg == "" {
			return fmt.Errorf("failed to load roles and no specific role provided: %w", err)
		} else {
			fmt.Fprintf(os.Stderr, "Warning: Failed to load roles list: %v. Proceeding with specified role '%s'.\n", err, roleNameArg)
		}
	}

	// Determine roleName
	var roleName string
	if roleNameArg != "" {
		// Validate provided role name if roles were loaded successfully
		if len(roles) > 0 && !slices.Contains(roles, roleNameArg) {
			return fmt.Errorf("specified role '%s' not found for account '%s'", roleNameArg, accountName)
		}
		roleName = roleNameArg
	} else {
		// Try to get last used role
		lastUsedRole, err := configMgr.GetLastSelectedRole(selectedProfile.Name, selectedAccount.Name)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to get last used role: %v\n", err)
		}
		if lastUsedRole != "" && slices.Contains(roles, lastUsedRole) {
			roleName = lastUsedRole
		} else {
			// Fallback: Use the first available role, or AdministratorAccess
			roleName = "AdministratorAccess"
			if len(roles) > 0 {
				roleName = roles[0]
			} else if lastUsedRole != "" {
				// If roles failed to load but we had a last used one, try it anyway
				fmt.Fprintf(os.Stderr, "Warning: Could not verify last used role '%s' as role list failed to load. Using it anyway.\n", lastUsedRole)
				roleName = lastUsedRole
			}
		}
	}

	// Use account-specific region if available, otherwise use SSO default
	var region string
	if regionFlag != "" {
		region = regionFlag
	} else {
		var err error
		region, err = configMgr.GetAccountRegion(selectedProfile.Name, selectedAccount.Name)
		if err != nil || region == "" {
			region = selectedProfile.DefaultRegion
		}
	}

	if browserFlag {
		// Open AWS console in browser
		url := awsClient.GetAccountURL(selectedAccount.AccountID, accessToken, selectedProfile.StartURL, roleName)
		// Style the output message
		outputMsg := lipgloss.JoinHorizontal(lipgloss.Left,
			cliStyles.text.Render("Opening AWS Console for "),
			cliStyles.primary.Render(selectedProfile.Name),
			cliStyles.text.Render(" / "),
			cliStyles.primary.Render(selectedAccount.Name),
			cliStyles.text.Render(" / "),
			cliStyles.primary.Render(roleName),
		)
		fmt.Println(outputMsg)
		if err := utils.OpenBrowser(url); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: Failed to open browser automatically: %v\\n", err)
			fmt.Printf("URL: %s\\n", url)
		}
	} else {
		// Get credentials for the role
		resp, err := awsClient.GetRoleCredentials(ctx, accessToken, selectedAccount.AccountID, roleName)
		if err != nil {
			return fmt.Errorf("failed to get role credentials: %w", err)
		}

		// Write credentials
		err = config.WriteCredentials(
			*resp.RoleCredentials.AccessKeyId,
			*resp.RoleCredentials.SecretAccessKey,
			*resp.RoleCredentials.SessionToken,
			region,
		)
		if err != nil {
			return fmt.Errorf("failed to write credentials: %w", err)
		}

		// Print success message with styling
		detailsContent := lipgloss.JoinVertical(lipgloss.Left,
			fmt.Sprintf("SSO Profile: %s", cliStyles.primary.Render(selectedProfile.Name)),
			fmt.Sprintf("Account: %s (%s)", cliStyles.primary.Render(selectedAccount.Name), cliStyles.muted.Render(selectedAccount.AccountID)),
			fmt.Sprintf("Role: %s", cliStyles.primary.Render(roleName)),
			fmt.Sprintf("Region: %s", cliStyles.primary.Render(region)),
		)
		details := cliStyles.successBox.Render(detailsContent)
		fmt.Printf("\n%s\n\n", details)
	}

	// Save the last used SSO profile after successful setup
	if err := configMgr.SaveLastSelectedSSOProfile(selectedProfile.Name); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected SSO profile: %v\n", err)
	}
	if err := configMgr.SaveLastSelectedAccount(selectedProfile.Name, selectedAccount.Name); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected account: %v\n", err)
	}
	if err := configMgr.SaveLastSelectedRole(selectedProfile.Name, selectedAccount.Name, roleName); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to save last selected role: %v\n", err)
	}

	return nil
}

func fatalError(errMsg string, usage string) {
	// Create default styles for CLI output (assuming dark background)
	cliStyles := getDynamicStyles(true)

	content := []string{cliStyles.errorText.Render(errMsg)}
	if usage != "" {
		content = append(content, "", cliStyles.help.Render(usage))
	}
	errorMsgBox := cliStyles.errorBox.Render(
		lipgloss.JoinVertical(lipgloss.Left,
			content...,
		),
	)
	fmt.Print("\n", errorMsgBox, "\n\n")
	os.Exit(0)
}

// handleLastSessionBrowser handles the logic for `sesh -b`
func handleLastSessionBrowser() {
	configMgr, err := config.NewManager()
	if err != nil {
		fatalError(fmt.Sprintf("Error initializing config manager: %v", err), "")
	}

	// Create default styles for CLI output (assuming dark background)
	cliStyles := getDynamicStyles(true)

	lastSSOProfileName, err := configMgr.GetLastSelectedSSOProfile()
	if err != nil || lastSSOProfileName == "" {
		fatalError(
			"Error: Could not determine the last used SSO profile.",
			"Please run 'sesh' interactively or 'sesh <SSONAME> <ACCOUNTNAME> [ROLENAME]' first.",
		)
	}

	profiles, err := configMgr.LoadProfiles()
	if err != nil {
		fatalError(fmt.Sprintf("Error loading SSO profiles: %v", err), "")
	}

	var selectedProfile *config.SSOProfile
	for i := range profiles {
		if profiles[i].Name == lastSSOProfileName {
			selectedProfile = &profiles[i]
			break
		}
	}
	if selectedProfile == nil {
		fatalError(
			fmt.Sprintf("Error: Last used SSO profile '%s' not found in configuration.", lastSSOProfileName),
			"Please check your configuration or run 'sesh' interactively.",
		)
	}

	awsClient, err := aws.NewClient(selectedProfile.SSORegion)
	if err != nil {
		fatalError(fmt.Sprintf("Error initializing AWS client: %v", err), "")
	}

	// Attempt to load cached token
	cachedToken, err := configMgr.LoadToken(selectedProfile.StartURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to check token cache: %v\\n", err)
		// Continue, but opening browser might fail if token is required and invalid
	}

	if cachedToken == nil {
		fatalError(
			"Error: No active session found for the last used profile. Authentication required.",
			fmt.Sprintf("Please run 'sesh' interactively or 'sesh %s <ACCOUNTNAME>' first.", selectedProfile.Name),
		)
	}
	accessToken := cachedToken.AccessToken

	lastAccountName, err := configMgr.GetLastSelectedAccount(selectedProfile.Name)
	if err != nil || lastAccountName == "" {
		fatalError(
			fmt.Sprintf("Error: Could not determine the last used account for profile '%s'.", selectedProfile.Name),
			fmt.Sprintf("Please run 'sesh %s <ACCOUNTNAME>' first.", selectedProfile.Name),
		)
	}

	lastRoleName, err := configMgr.GetLastSelectedRole(selectedProfile.Name, lastAccountName)
	if err != nil || lastRoleName == "" {
		// Attempt to determine a default/fallback role if none specifically saved
		fmt.Fprintf(os.Stderr, "Warning: Last used role not found for %s/%s. Attempting fallback...\\n", selectedProfile.Name, lastAccountName)
		// Try AdministratorAccess first, this might need adjustment based on common roles
		lastRoleName = "AdministratorAccess"
		// Note: We don't have the roles list here without fetching accounts + roles,
		// so we proceed with the fallback role name optimistically.
	}

	// Fetch accounts to get the Account ID (necessary for GetAccountURL)
	ctx := context.Background()
	accounts, err := awsClient.ListAccounts(ctx, accessToken, nil)
	if err != nil {
		fatalError(
			fmt.Sprintf("Error listing accounts for profile '%s': %v", selectedProfile.Name, err),
			"Ensure your SSO session is valid.",
		)
	}

	var selectedAccountID string
	for _, acc := range accounts {
		if acc.Name == lastAccountName {
			selectedAccountID = acc.AccountID
			break
		}
	}

	if selectedAccountID == "" {
		fatalError(
			fmt.Sprintf("Error: Last used account '%s' not found within profile '%s'.", lastAccountName, selectedProfile.Name),
			fmt.Sprintf("Account list might be outdated or name mismatch. Try 'sesh %s %s' directly.", selectedProfile.Name, lastAccountName),
		)
	}

	// Generate URL and open browser
	url := awsClient.GetAccountURL(selectedAccountID, accessToken, selectedProfile.StartURL, lastRoleName)
	// Style the output message
	outputMsg := lipgloss.JoinHorizontal(lipgloss.Left,
		cliStyles.text.Render("Opening AWS Console for "),
		cliStyles.primary.Render(selectedProfile.Name),
		cliStyles.text.Render(" / "),
		cliStyles.primary.Render(lastAccountName),
		cliStyles.text.Render(" / "),
		cliStyles.primary.Render(lastRoleName),
	)
	fmt.Println(outputMsg)
	if err := utils.OpenBrowser(url); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to open browser automatically: %v\\n", err)
		fmt.Printf("URL: %s\\n", url) // Print URL if browser fails
	}
	os.Exit(0)
}

// handleInteractiveSession handles the interactive TUI mode.
func handleInteractiveSession() {
	os.Setenv("AWS_SDK_GO_V2_ENABLETRUSTEDCREDENTIALSFEATURE", "true")

	p := tea.NewProgram(initialModel(), tea.WithAltScreen(), tea.WithKeyboardEnhancements())
	m, err := p.Run()
	if err != nil {
		fatalError(fmt.Sprintf("Error running program: %v", err), "")
	}

	// Print session information after program has quit (successful interactive session)
	if model, ok := m.(model); ok {
		if model.selectedAcc != nil && model.selectedAcc.SelectedRole != "" {
			// Use the final dynamic styles from the model for this message
			finalStyles := model.dynamicStyles
			// Use account-specific region if available, otherwise use SSO default
			region := model.selectedAcc.Region
			if region == "" {
				region = model.selectedSSO.DefaultRegion
			}
			detailsContent := lipgloss.JoinVertical(lipgloss.Left,
				fmt.Sprintf("SSO Profile: %s", finalStyles.primary.Render(model.selectedSSO.Name)),
				fmt.Sprintf("Account: %s (%s)", finalStyles.primary.Render(model.selectedAcc.Name), finalStyles.muted.Render(model.selectedAcc.AccountID)),
				fmt.Sprintf("Role: %s", finalStyles.primary.Render(model.selectedAcc.SelectedRole)),
				fmt.Sprintf("Region: %s", finalStyles.primary.Render(region)),
			)
			details := finalStyles.successBox.Render(detailsContent)
			fmt.Printf("\n%s\n\n", details)
		}
	}
	os.Exit(0)
}

func main() {
	// Define flags
	browserFlag := flag.BoolP("browser", "b", false, "Open AWS console in browser instead of setting credentials")
	regionFlag := flag.StringP("region", "r", "", "Specify the AWS region to use")
	versionFlag := flag.BoolP("version", "v", false, "Print version information")

	flag.Parse()

	// Handle version flag immediately after parsing
	if *versionFlag {
		fmt.Printf("v%s\n", Version)
		os.Exit(0)
	}

	args := flag.Args()

	usageString := "Usage: sesh [options] [SSONAME ACCOUNTNAME [ROLENAME]]\nOptions:\n  --version, -v     Print version information\n  --browser, -b     Open AWS console in browser\n  --region, -r REGION Specify AWS region"

	// Check for direct session setup (2 or 3 args)
	if len(args) == 2 || len(args) == 3 {
		ssoName := args[0]
		accountName := args[1]
		roleNameArg := ""
		if len(args) == 3 {
			roleNameArg = args[2]
		}

		// Pass the role name arg and browser flag
		if err := directSessionSetup(ssoName, accountName, roleNameArg, *browserFlag, *regionFlag); err != nil {
			fatalError(err.Error(), usageString)
		}
		os.Exit(0)
	}

	// Handle interactive mode or opening last session (0 args)
	if len(args) == 0 {
		if *browserFlag {
			// Handle opening last session in browser
			handleLastSessionBrowser()
		} else {
			// Start interactive TUI
			handleInteractiveSession()
		}
	}

	// Handle incorrect number of arguments (not 0, 2, or 3)
	if len(args) != 2 && len(args) != 3 {
		var errorText string
		if len(args) < 2 {
			errorText = "Too few arguments"
		} else {
			errorText = "Too many arguments"
		}
		fatalError(errorText, usageString)
	}

	// If we reach here, something unexpected happened with argument parsing
	fatalError("Unhandled argument combination.", usageString)
}
