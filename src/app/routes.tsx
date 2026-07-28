/* eslint-disable react-refresh/only-export-components */
import { lazy, type ReactNode } from 'react';
import type { CityIndex } from '../services/fireWaterApi';
import type { FireFacility } from '../data/mockData';
import type { FacilityFilterState, FacilityViewState, ShelterCategory, TabId, NavigateTarget } from '../types/navigation';
import type { IncidentSession } from '../services/incidentSession';
import type { BuildingWorkspaceState } from '../types/buildingWorkspace';

const DashboardView = lazy(() => import('../components/DashboardView'));
const WeatherDashboard = lazy(() => import('../components/WeatherDashboard'));
const DamDischargeView = lazy(() => import('../components/DamDischargeView'));
const FacilitySearchView = lazy(() => import('../components/FacilitySearchView'));
const ERDashboard = lazy(() => import('../components/ERDashboard'));
const EmergencyAnalysis = lazy(() => import('../components/EmergencyAnalysis'));
const FireAnalysis = lazy(() => import('../components/FireAnalysis'));
const FireDamageView = lazy(() => import('../components/FireDamageView'));
const ConsumerHazardView = lazy(() => import('../components/ConsumerHazardView'));
const MultiUseView = lazy(() => import('../components/MultiUseView'));
const WildfireView = lazy(() => import('../components/WildfireView').then(module => ({ default: module.WildfireView })));
const HazmatView = lazy(() => import('../components/HazmatView'));
const AnnualFireView = lazy(() => import('../components/AnnualFireView'));
const ManualView = lazy(() => import('../components/ManualView'));
const Calculators = lazy(() => import('../components/Calculators'));
const FieldTimer = lazy(() => import('../components/FieldTimer'));
const Calendar = lazy(() => import('../components/Calendar'));
const NewsDashboard = lazy(() => import('../components/NewsDashboard'));
const EquipmentChecklist = lazy(() => import('../components/EquipmentChecklist'));
const EquipmentCertSearch = lazy(() => import('../components/EquipmentCertSearch'));
const LawDashboard = lazy(() => import('../components/LawDashboard'));
const PolicyDashboard = lazy(() => import('../components/PolicyDashboard'));
const EmsProtocol = lazy(() => import('../components/EmsProtocol'));
const TriageView = lazy(() => import('../components/TriageView'));
const ActivityLog = lazy(() => import('../components/ActivityLog'));
const PrePlanView = lazy(() => import('../components/PrePlanView'));
const SafetyMonitor = lazy(() => import('../components/SafetyMonitor'));
const IncidentModeView = lazy(() => import('../components/IncidentModeView'));
const AviationView = lazy(() => import('../components/AviationView'));
const OfflineReadinessView = lazy(() => import('../components/OfflineReadinessView'));

export interface RouteContext {
  activeSubId?: string;
  city: string;
  cityLabel: string;
  fireFacilities: FireFacility[];
  isLoadingFacilities: boolean;
  cityIndex: CityIndex | null;
  selectedDistrict: string | null;
  shelterCategory: ShelterCategory;
  facilityFilterState: FacilityFilterState;
  facilityViewState: FacilityViewState;
  preplanSearch: string;
  buildingWorkspace: BuildingWorkspaceState;
  onDistrictChange: (district: string) => void;
  onShelterCategoryChange: (category: ShelterCategory) => void;
  onFacilityFilterChange: (patch: Partial<FacilityFilterState>) => void;
  onFacilityViewStateChange: (patch: Partial<FacilityViewState>) => void;
  onPreplanSearchChange: (query: string) => void;
  onBuildingWorkspaceChange: (patch: Partial<BuildingWorkspaceState>) => void;
  onNavigate: (tab: NavigateTarget | string, subId?: string) => void;
  incidentSession: IncidentSession;
}

export interface TabRoute {
  render: (context: RouteContext) => ReactNode;
}

export const TAB_ROUTES: Record<TabId, TabRoute> = {
  dashboard: {
    render: ctx => (
      <DashboardView
        onNavigate={ctx.onNavigate}
        city={ctx.city}
        fireFacilities={ctx.fireFacilities}
        isLoadingFacilities={ctx.isLoadingFacilities}
        cityIndex={ctx.cityIndex}
      />
    ),
  },
  weather: { render: ctx => <WeatherDashboard city={ctx.city} /> },
  'dam-discharge': { render: () => <DamDischargeView /> },
  shelter: {
    render: ctx => (
      <FacilitySearchView
        city={ctx.city}
        fireFacilities={ctx.fireFacilities}
        isLoadingFacilities={ctx.isLoadingFacilities}
        cityIndex={ctx.cityIndex}
        selectedDistrict={ctx.selectedDistrict}
        onDistrictChange={ctx.onDistrictChange}
        activeCategory={ctx.shelterCategory}
        filterState={ctx.facilityFilterState}
        viewState={ctx.facilityViewState}
        onCategoryChange={ctx.onShelterCategoryChange}
        onFilterStateChange={ctx.onFacilityFilterChange}
        onViewStateChange={ctx.onFacilityViewStateChange}
        incidentAddress={ctx.incidentSession.active ? ctx.incidentSession.address : ''}
        buildingWorkspace={ctx.buildingWorkspace}
        onBuildingWorkspaceChange={ctx.onBuildingWorkspaceChange}
      />
    ),
  },
  er: { render: ctx => <ERDashboard city={ctx.city} /> },
  emergency: { render: () => <EmergencyAnalysis /> },
  'fire-analysis': { render: () => <FireAnalysis /> },
  'fire-damage': { render: () => <FireDamageView /> },
  hazards: { render: () => <ConsumerHazardView /> },
  multiuse: { render: ctx => <MultiUseView city={ctx.city} /> },
  wildfire: { render: ctx => <WildfireView cityName={ctx.cityLabel} /> },
  hazmat: { render: () => <HazmatView /> },
  'annual-fire': { render: () => <AnnualFireView /> },
  manual: { render: () => <ManualView /> },
  calculator: { render: ctx => <Calculators subId={ctx.activeSubId} /> },
  'field-timer': { render: () => <FieldTimer /> },
  calendar: { render: () => <Calendar /> },
  news: { render: ctx => <NewsDashboard city={ctx.city} /> },
  checklist: { render: () => <EquipmentChecklist /> },
  'equipment-cert': { render: () => <EquipmentCertSearch /> },
  law: { render: ctx => <LawDashboard subId={ctx.activeSubId} /> },
  policy: { render: () => <PolicyDashboard /> },
  'ems-protocol': { render: ctx => <EmsProtocol subId={ctx.activeSubId} /> },
  triage: { render: ctx => <TriageView city={ctx.city} /> },
  'activity-log': { render: () => <ActivityLog /> },
  preplan: {
    render: ctx => (
      <PrePlanView
        searchQuery={ctx.preplanSearch}
        onSearchQueryChange={ctx.onPreplanSearchChange}
        incidentContext={ctx.incidentSession.active ? {
          title: ctx.incidentSession.title,
          address: ctx.incidentSession.address,
        } : null}
      />
    ),
  },
  'safety-monitor': { render: ctx => <SafetyMonitor city={ctx.city} /> },
  incident: {
    render: ctx => (
      <IncidentModeView
        city={ctx.city}
        cityLabel={ctx.cityLabel}
        fireFacilities={ctx.fireFacilities}
        isLoadingFacilities={ctx.isLoadingFacilities}
        cityIndex={ctx.cityIndex}
        onNavigate={ctx.onNavigate}
      />
    ),
  },
  aviation: { render: ctx => <AviationView city={ctx.city} /> },
  'offline-readiness': { render: ctx => <OfflineReadinessView city={ctx.city} cityLabel={ctx.cityLabel} /> },
};

export function renderTabRoute(tab: TabId, context: RouteContext): ReactNode {
  return TAB_ROUTES[tab]?.render(context) ?? TAB_ROUTES.dashboard.render(context);
}
