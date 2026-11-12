package pe.telco.activacion.service;

import pe.telco.activacion.dao.LineaDAO;

public class ActivacionService {
    private LineaDAO lineaDao;

    public void validarCliente(Cliente cliente, String tipoPlan) {
        if (cliente.getDeudaTotal() > 0) {
            throw new BusinessException("El cliente tiene deuda pendiente");
        }
        if (cliente.getEdad() < 18) {
            throw new BusinessException("El titular debe ser mayor de edad");
        }
        if ("POS".equals(tipoPlan) && cliente.getScoreCrediticio() < 450) {
            throw new BusinessException("Score insuficiente para plan postpago");
        }
        if (lineaDao.contarLineasActivas(cliente.getDocumento()) >= 5) {
            throw new BusinessException("Supera el maximo de lineas por cliente");
        }
    }

    public double calcularCargoInicial(String tipoPlan, String canal, double precioPlan, int diasRestantes) {
        double cargo = "PRE".equals(tipoPlan) ? 0 : precioPlan * diasRestantes / 30;
        if ("WEB".equals(canal)) {
            cargo = cargo * 0.90;
        }
        if (cargo > 0 && cargo < 5) {
            cargo = 5;
        }
        return cargo;
    }

    public void actualizarEstado(Solicitud solicitud) {
        switch (solicitud.getCodigoRespuesta()) {
            case 0:
                solicitud.setEstado("ACT");
                break;
            case 98:
                solicitud.setEstado("PEN");
                break;
            default:
                solicitud.setEstado("REC");
        }
    }
}
